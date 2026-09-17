import { prisma } from "./prisma";
import { DEFAULT_DEPOSIT_POLICY, holdLapsed, type DepositPolicy } from "./deposits";

/**
 * The database side of deposits: the shop's policy, where to send the money,
 * and clearing bookings whose deposit never arrived.
 */

const KEYS = {
  enabled: "deposit_enabled",
  threshold: "deposit_threshold",
  percent: "deposit_percent",
  holdHours: "deposit_hold_hours",
} as const;

/** Where the customer sends it. Without this, nothing can be asked for. */
export const INSTAPAY_KEY = "deposit_instapay_address";

export async function getDepositPolicy(): Promise<DepositPolicy> {
  const rows = await prisma.setting.findMany({ where: { key: { in: Object.values(KEYS) } } }).catch((err) => {
    console.error("[deposits] settings lookup failed", err);
    return [] as { key: string; value: string }[];
  });
  const value = (key: string) => rows.find((r) => r.key === key)?.value;
  const number = (key: string, fallback: number) => {
    const parsed = parseFloat(value(key) ?? "");
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  return {
    // Off until the shop asks for it: taking money up front is a policy
    // decision, not a default.
    enabled: (value(KEYS.enabled) ?? "0") === "1",
    threshold: number(KEYS.threshold, DEFAULT_DEPOSIT_POLICY.threshold),
    percent: Math.min(100, number(KEYS.percent, DEFAULT_DEPOSIT_POLICY.percent)),
    holdHours: number(KEYS.holdHours, DEFAULT_DEPOSIT_POLICY.holdHours),
  };
}

export async function saveDepositPolicy(input: Partial<DepositPolicy>): Promise<void> {
  const entries = Object.entries(KEYS).filter(([field]) => input[field as keyof DepositPolicy] !== undefined);
  await prisma.$transaction(
    entries.map(([field, key]) => {
      const raw = input[field as keyof DepositPolicy];
      const value = typeof raw === "boolean" ? (raw ? "1" : "0") : String(raw ?? "");
      return prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
    })
  );
}

/** The number or name a customer sends the transfer to. */
export async function getInstapayAddress(): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key: INSTAPAY_KEY } }).catch(() => null);
  return row?.value?.trim() || null;
}

/**
 * Let go of bookings whose deposit never came.
 *
 * The chair was only ever held, not given: once the time is up it goes back to
 * everybody else. Run when the diary is read and once a night, for the same
 * reason the waiting list is tidied that way — the host runs scheduled work
 * daily, so anything promising a minute-by-minute sweep would be a lie.
 */
export async function releaseLapsedHolds(): Promise<number> {
  const candidates = await prisma.appointment.findMany({
    where: {
      depositStatus: "EXPECTED",
      holdUntil: { lt: new Date() },
      status: { in: ["PENDING", "CONFIRMED"] },
    },
    select: { id: true, status: true, depositStatus: true, holdUntil: true },
  });

  const lapsed = candidates.filter((booking) => holdLapsed(booking));
  if (lapsed.length === 0) return 0;

  const done = await prisma.appointment.updateMany({
    where: { id: { in: lapsed.map((b) => b.id) } },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelReason: "The deposit did not arrive in time",
    },
  });

  return done.count;
}
