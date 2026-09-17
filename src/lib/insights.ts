import { shopDateISO, shopWeekday } from "./booking";

/**
 * What the numbers say about the shop, beyond what it took.
 *
 * Everything here reads paid visits — the same rows the takings are made of —
 * so an insight can never disagree with the money. The functions are pure and
 * take plain rows, which is what makes them testable and what stops the
 * dashboard and the report drifting apart.
 */

export interface VisitRow {
  customerId: string;
  barberId: string | null;
  visitAt: Date | string;
  total: number;
}

const DAY = 86_400_000;
const time = (value: Date | string) => new Date(value).getTime();

export interface NewVersusReturning {
  /** Visits by somebody the shop had never served before this window. */
  fresh: number;
  returning: number;
  /** Share of visits that were somebody's first, 0–100, to one decimal. */
  freshPercent: number;
}

/**
 * First-timers against regulars.
 *
 * `firstVisitAt` must be each customer's very first visit, taken from their
 * whole history — otherwise everybody looks new the moment the window opens,
 * which is the mistake this exists to avoid.
 */
export function newVersusReturning(visits: VisitRow[], firstVisitAt: Record<string, Date | string>): NewVersusReturning {
  let fresh = 0;
  for (const visit of visits) {
    const first = firstVisitAt[visit.customerId];
    if (first !== undefined && time(first) === time(visit.visitAt)) fresh += 1;
  }
  const returning = visits.length - fresh;
  return {
    fresh,
    returning,
    freshPercent: visits.length === 0 ? 0 : Math.round((fresh / visits.length) * 1000) / 10,
  };
}

export interface BusyBucket {
  /** 0–6 for a weekday, 0–23 for an hour. */
  key: number;
  visits: number;
  takings: number;
}

/** Visits and takings by day of the week, in the shop's own time. */
export function byWeekday(visits: VisitRow[], timeZone?: string): BusyBucket[] {
  const buckets: BusyBucket[] = Array.from({ length: 7 }, (_, key) => ({ key, visits: 0, takings: 0 }));
  for (const visit of visits) {
    const day = shopWeekday(time(visit.visitAt), timeZone);
    buckets[day].visits += 1;
    buckets[day].takings += visit.total;
  }
  return buckets;
}

/** The same by hour, which is what tells the shop when to have two chairs going. */
export function byHour(visits: VisitRow[], timeZone = "Africa/Cairo"): BusyBucket[] {
  const buckets: BusyBucket[] = Array.from({ length: 24 }, (_, key) => ({ key, visits: 0, takings: 0 }));
  for (const visit of visits) {
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hour12: false }).format(new Date(visit.visitAt))
    );
    const slot = Number.isFinite(hour) ? hour % 24 : 0;
    buckets[slot].visits += 1;
    buckets[slot].takings += visit.total;
  }
  return buckets;
}

export interface BarberShare {
  barberId: string;
  visits: number;
  takings: number;
  /** Average taken per visit, to the piastre. */
  average: number;
  /** Share of the shop's takings over the window, 0–100. */
  share: number;
}

/** Who did how much of the work, and what it was worth. */
export function barberShares(visits: VisitRow[]): BarberShare[] {
  const totals: Record<string, { visits: number; takings: number }> = {};
  let shopTotal = 0;

  for (const visit of visits) {
    if (!visit.barberId) continue;
    (totals[visit.barberId] ??= { visits: 0, takings: 0 });
    totals[visit.barberId].visits += 1;
    totals[visit.barberId].takings += visit.total;
    shopTotal += visit.total;
  }

  return Object.keys(totals)
    .map((barberId) => {
      const row = totals[barberId];
      return {
        barberId,
        visits: row.visits,
        takings: Math.round(row.takings * 100) / 100,
        average: Math.round((row.takings / row.visits) * 100) / 100,
        share: shopTotal === 0 ? 0 : Math.round((row.takings / shopTotal) * 1000) / 10,
      };
    })
    .sort((a, b) => b.takings - a.takings);
}

export interface Retention {
  /** Customers who have been in more than once, ever. */
  repeatCustomers: number;
  customers: number;
  /** Share of customers who came back at least once, 0–100. */
  repeatPercent: number;
  /** Typical gap between one visit and the next, in days. Null with too little history. */
  medianGapDays: number | null;
  /** Regulars (two visits or more) who have not been in for a while. */
  slipping: string[];
}

/**
 * Whether people come back.
 *
 * `history` is every visit the shop has, per customer, in order — retention is a
 * question about lifetimes, not about a window, and answering it from a month's
 * rows would say more about the month than about the shop.
 */
export function retention(
  history: Record<string, (Date | string)[]>,
  now: number = Date.now(),
  slippingAfterDays = 60
): Retention {
  const customers = Object.keys(history);
  const gaps: number[] = [];
  const slipping: string[] = [];
  let repeatCustomers = 0;

  for (const customerId of customers) {
    const visits = history[customerId].map(time).sort((a, b) => a - b);
    if (visits.length > 1) {
      repeatCustomers += 1;
      for (let i = 1; i < visits.length; i++) gaps.push((visits[i] - visits[i - 1]) / DAY);

      const last = visits[visits.length - 1];
      if (now - last > slippingAfterDays * DAY) slipping.push(customerId);
    }
  }

  gaps.sort((a, b) => a - b);
  const middle = Math.floor(gaps.length / 2);
  const median =
    gaps.length === 0
      ? null
      : gaps.length % 2 === 1
        ? gaps[middle]
        : (gaps[middle - 1] + gaps[middle]) / 2;

  return {
    customers: customers.length,
    repeatCustomers,
    repeatPercent: customers.length === 0 ? 0 : Math.round((repeatCustomers / customers.length) * 1000) / 10,
    medianGapDays: median === null ? null : Math.round(median * 10) / 10,
    slipping,
  };
}

/** Takings per shop day, for a line the owner can read at a glance. */
export function byDay(visits: VisitRow[], timeZone?: string): { date: string; visits: number; takings: number }[] {
  const days: Record<string, { visits: number; takings: number }> = {};
  for (const visit of visits) {
    const date = shopDateISO(time(visit.visitAt), timeZone);
    (days[date] ??= { visits: 0, takings: 0 });
    days[date].visits += 1;
    days[date].takings += visit.total;
  }
  return Object.keys(days)
    .sort()
    .map((date) => ({ date, ...days[date] }));
}
