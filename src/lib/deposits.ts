/**
 * Deposits on the long, expensive services.
 *
 * A missed Hydrofacial costs the chair for two hours, and the shop has no way
 * to recover it. So for work over a price the shop sets, booking online asks
 * for a deposit by InstaPay first.
 *
 * The accounting is the whole point, and it is easy to get wrong. A deposit is
 * **not revenue when it arrives** — it is the shop holding somebody's money
 * against a future haircut. It becomes revenue in exactly one of two ways:
 *
 *  - the customer comes, and it pays part of the visit, which is where the
 *    money has always been recorded;
 *  - the customer never comes, and the shop keeps it — which is income, but not
 *    a haircut, so it is reported on its own line rather than mixed into the
 *    takings.
 *
 * Counting it on the day it arrives would double it the moment the visit is
 * rung up, and would make a booking's money land in two places. It does not.
 */

export interface DepositPolicy {
  enabled: boolean;
  /** Work priced at or above this asks for a deposit. */
  threshold: number;
  /** What share of the price to ask for, 1–100. */
  percent: number;
  /** Hours the customer has to send it before the booking lapses. */
  holdHours: number;
}

export const DEFAULT_DEPOSIT_POLICY: DepositPolicy = {
  enabled: false,
  threshold: 1000,
  percent: 25,
  holdHours: 24,
};

export type DepositStatus = "EXPECTED" | "RECEIVED" | "USED" | "REFUNDED" | "FORFEITED";

/** Is this booking expensive enough to ask for one? */
export function needsDeposit(totalPrice: number, policy: DepositPolicy): boolean {
  return policy.enabled && totalPrice >= policy.threshold && policy.threshold > 0;
}

/**
 * What to ask for. Rounded to whole pounds, because a customer typing an
 * InstaPay transfer should not be asked for piastres — and capped at the price,
 * so a policy nobody has sanity-checked can never ask for more than the work.
 */
export function depositFor(totalPrice: number, policy: DepositPolicy): number {
  if (!needsDeposit(totalPrice, policy)) return 0;
  const share = Math.round((totalPrice * policy.percent) / 100);
  return Math.max(1, Math.min(share, Math.round(totalPrice)));
}

/**
 * The reference the customer puts on the transfer, and the shop matches against.
 *
 * Short, unambiguous when read aloud, and tied to the booking — a transfer with
 * no reference is a puzzle somebody has to solve by hand.
 */
export function referenceFor(appointmentId: string): string {
  const tail = appointmentId.replace(/[^a-zA-Z0-9]/g, "").slice(-5).toUpperCase();
  return `ESC-${tail}`;
}

/** When a booking held for a deposit gives up waiting. */
export function holdExpiry(bookedAt: Date | string | number, policy: DepositPolicy): Date {
  return new Date(new Date(bookedAt).getTime() + policy.holdHours * 3_600_000);
}

export interface HeldBooking {
  status: string;
  depositStatus?: DepositStatus | null;
  holdUntil?: Date | string | null;
}

/**
 * Has an unpaid booking run out of time?
 *
 * Only a booking still waiting on its deposit can lapse. Once the money is in,
 * the chair is theirs and nothing here touches it.
 */
export function holdLapsed(booking: HeldBooking, now: number = Date.now()): boolean {
  if (booking.depositStatus !== "EXPECTED") return false;
  if (!booking.holdUntil) return false;
  if (booking.status === "CANCELLED" || booking.status === "COMPLETED") return false;
  return new Date(booking.holdUntil).getTime() <= now;
}

/** What is still owed at the till, once the deposit has done its work. */
export function balanceAfterDeposit(total: number, deposit: number, status: DepositStatus | null | undefined): number {
  const paid = status === "RECEIVED" || status === "USED" ? deposit : 0;
  return Math.round(Math.max(0, total - paid) * 100) / 100;
}

export interface DepositRow {
  amount: number;
  status: DepositStatus;
}

export interface DepositSummary {
  /** Sent in and not yet spent: the shop is holding this money. */
  held: number;
  /** Deposits that paid for a visit. Already inside the takings. */
  used: number;
  /** Kept after a no-show. Income, but not a haircut. */
  forfeited: number;
  refunded: number;
  /** Asked for and not yet sent. Not money, just a hope. */
  expected: number;
}

export function summarise(deposits: DepositRow[]): DepositSummary {
  const total = (status: DepositStatus) =>
    Math.round(deposits.filter((d) => d.status === status).reduce((sum, d) => sum + d.amount, 0) * 100) / 100;

  return {
    held: total("RECEIVED"),
    used: total("USED"),
    forfeited: total("FORFEITED"),
    refunded: total("REFUNDED"),
    expected: total("EXPECTED"),
  };
}
