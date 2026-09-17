/**
 * Groups of customers, worked out from their visits.
 *
 * A segment is a rule, not a list: nothing is stored, so a customer joins and
 * leaves by living their life, and a group can never go stale behind the shop's
 * back. Every rule reads paid visits only — the same rows the money is made of.
 *
 * The thresholds are stated once, here, because a shop that cannot say exactly
 * what "a regular" means will argue about the number on the screen.
 */

export const SEGMENT_KEYS = ["newcomers", "regulars", "slipping", "lapsed", "bigSpenders", "oneVisitOnly"] as const;
export type SegmentKey = (typeof SEGMENT_KEYS)[number];

export interface SegmentRules {
  /** A first visit this recently makes somebody a newcomer. */
  newcomerDays: number;
  /** Visits that make somebody a regular. */
  regularVisits: number;
  /** A regular unseen this long is slipping away. */
  slippingDays: number;
  /** Anybody unseen this long has lapsed, regular or not. */
  lapsedDays: number;
  /** Lifetime spend that counts as a big spender. */
  bigSpenderTotal: number;
}

export const DEFAULT_SEGMENT_RULES: SegmentRules = {
  newcomerDays: 60,
  regularVisits: 3,
  slippingDays: 60,
  lapsedDays: 180,
  bigSpenderTotal: 3000,
};

export interface CustomerSummary {
  customerId: string;
  visits: number;
  firstVisitAt: number;
  lastVisitAt: number;
  spend: number;
}

const DAY = 86_400_000;
const time = (value: Date | string | number) => new Date(value).getTime();

/** Every customer's history, reduced to the handful of numbers the rules need. */
export function summarise(visits: { customerId: string; visitAt: Date | string; total: number }[]): CustomerSummary[] {
  const rows: Record<string, CustomerSummary> = {};

  for (const visit of visits) {
    const at = time(visit.visitAt);
    const row = (rows[visit.customerId] ??= {
      customerId: visit.customerId,
      visits: 0,
      firstVisitAt: at,
      lastVisitAt: at,
      spend: 0,
    });
    row.visits += 1;
    row.spend += visit.total;
    if (at < row.firstVisitAt) row.firstVisitAt = at;
    if (at > row.lastVisitAt) row.lastVisitAt = at;
  }

  return Object.values(rows).map((row) => ({ ...row, spend: Math.round(row.spend * 100) / 100 }));
}

/**
 * Does this customer belong to that group right now?
 *
 * The groups overlap on purpose — a big spender may also be slipping away, and
 * that is exactly the person the shop wants to ring. Only "lapsed" and
 * "slipping" are kept apart, so the same person is not chased twice.
 */
export function inSegment(
  customer: CustomerSummary,
  segment: SegmentKey,
  now: number = Date.now(),
  rules: SegmentRules = DEFAULT_SEGMENT_RULES
): boolean {
  const sinceLast = (now - customer.lastVisitAt) / DAY;
  const sinceFirst = (now - customer.firstVisitAt) / DAY;

  switch (segment) {
    case "newcomers":
      return sinceFirst <= rules.newcomerDays;

    case "regulars":
      return customer.visits >= rules.regularVisits && sinceLast <= rules.slippingDays;

    case "slipping":
      // Somebody who came back at least once, has gone quiet, but is not yet a
      // lost cause: still worth a friendly word.
      return customer.visits >= 2 && sinceLast > rules.slippingDays && sinceLast <= rules.lapsedDays;

    case "lapsed":
      return sinceLast > rules.lapsedDays;

    case "bigSpenders":
      return customer.spend >= rules.bigSpenderTotal;

    case "oneVisitOnly":
      // Tried the shop once and never came back — the group worth understanding
      // before it is worth messaging.
      return customer.visits === 1 && sinceLast > rules.newcomerDays;

    default:
      return false;
  }
}

export function membersOf(
  customers: CustomerSummary[],
  segment: SegmentKey,
  now: number = Date.now(),
  rules: SegmentRules = DEFAULT_SEGMENT_RULES
): CustomerSummary[] {
  return customers
    .filter((customer) => inSegment(customer, segment, now, rules))
    .sort((a, b) => b.lastVisitAt - a.lastVisitAt);
}

export function segmentCounts(
  customers: CustomerSummary[],
  now: number = Date.now(),
  rules: SegmentRules = DEFAULT_SEGMENT_RULES
): Record<SegmentKey, number> {
  const counts = {} as Record<SegmentKey, number>;
  for (const segment of SEGMENT_KEYS) {
    counts[segment] = customers.filter((customer) => inSegment(customer, segment, now, rules)).length;
  }
  return counts;
}
