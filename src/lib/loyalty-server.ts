import { prisma } from "./prisma";
import { DEFAULT_LOYALTY_SETTINGS, standing, type LoyaltySettings, type LoyaltyStanding } from "./loyalty";

/**
 * The database side of loyalty. The rules themselves live in ./loyalty, which
 * stays pure so the till, the customer app and the tests all count the same way.
 */

const KEYS = {
  enabled: "loyalty_enabled",
  visitsRequired: "loyalty_visits_required",
  rewardText: "loyalty_reward_text",
  rewardTextAr: "loyalty_reward_text_ar",
} as const;

export async function getLoyaltySettings(): Promise<LoyaltySettings> {
  const rows = await prisma.setting.findMany({ where: { key: { in: Object.values(KEYS) } } }).catch((err) => {
    console.error("[loyalty] settings lookup failed", err);
    return [] as { key: string; value: string }[];
  });
  const value = (key: string) => rows.find((r) => r.key === key)?.value;

  const required = parseInt(value(KEYS.visitsRequired) ?? "", 10);
  return {
    // Off until the shop turns it on: a punch card nobody announced is a
    // promise the shop did not make.
    enabled: (value(KEYS.enabled) ?? "0") === "1",
    visitsRequired: Number.isFinite(required) && required > 0 ? required : DEFAULT_LOYALTY_SETTINGS.visitsRequired,
    rewardText: value(KEYS.rewardText) || DEFAULT_LOYALTY_SETTINGS.rewardText,
    rewardTextAr: value(KEYS.rewardTextAr) || null,
  };
}

export async function saveLoyaltySettings(input: Partial<LoyaltySettings>): Promise<void> {
  const entries = Object.entries(KEYS).filter(([field]) => input[field as keyof LoyaltySettings] !== undefined);
  await prisma.$transaction(
    entries.map(([field, key]) => {
      const raw = input[field as keyof LoyaltySettings];
      const value = typeof raw === "boolean" ? (raw ? "1" : "0") : String(raw ?? "");
      return prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
    })
  );
}

/** Where one customer stands: paid visits counted against rewards given. */
export async function standingFor(customerId: string, settings?: LoyaltySettings): Promise<LoyaltyStanding> {
  const loyalty = settings ?? (await getLoyaltySettings());
  const [visits, redeemed] = await Promise.all([
    prisma.visit.count({ where: { customerId } }),
    prisma.loyaltyRedemption.count({ where: { customerId } }),
  ]);
  return standing(visits, redeemed, loyalty);
}
