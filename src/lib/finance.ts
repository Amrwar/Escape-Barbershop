import { prisma } from "./prisma";

/**
 * Money model used across the drawer, day report, reports and dashboard.
 *
 *  - Revenue          = visit totals (tips excluded — tips belong to the barber).
 *  - Visa commission  = card collected × `visa_commission_percent`. It is a cost of
 *                       collecting by card: it reduces the card account and the net
 *                       revenue, and never touches the cash drawer.
 *  - Expenses         = real operating costs, split by how they were paid:
 *                       CASH expenses reduce drawer cash, CARD expenses reduce the
 *                       card account. Both reduce net revenue.
 *  - Advances (سلف)   = money handed to a barber against a future salary. It leaves
 *                       the drawer (or the card account) but it is NOT an expense:
 *                       it is recovered in the payroll sheet, so it never reduces
 *                       revenue.
 *  - Penalties (جزاءات) = payroll-only. They never appear in any daily total.
 */

export const VISA_COMMISSION_KEY = "visa_commission_percent";

export async function getVisaCommissionPercent(): Promise<number> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: VISA_COMMISSION_KEY } });
    const pct = parseFloat(row?.value ?? "");
    return Number.isFinite(pct) && pct >= 0 ? pct : 0;
  } catch {
    return 0;
  }
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Commission charged by the card machine on a collected card amount. */
export function visaCommissionOn(cardAmount: number, percent: number): number {
  if (!percent || cardAmount <= 0) return 0;
  return round2((cardAmount * percent) / 100);
}

export interface JournalOutflows {
  cashExpenses: number;
  cardExpenses: number;
  expensesTotal: number;
  cashAdvances: number;
  cardAdvances: number;
  advancesTotal: number;
}

const EMPTY_OUTFLOWS: JournalOutflows = {
  cashExpenses: 0,
  cardExpenses: 0,
  expensesTotal: 0,
  cashAdvances: 0,
  cardAdvances: 0,
  advancesTotal: 0,
};

/**
 * Expenses and advances in a window, split by payment method. Leave `to` out for
 * an open-ended window — do not reach for a sentinel far-future date, Postgres
 * refuses to convert one.
 *
 * Each query is guarded so a not-yet-migrated database degrades to zeroes rather
 * than breaking the page, but the failure is logged: a silent zero on a money
 * screen is worse than a loud one.
 */
export async function getJournalOutflows(from: Date, to?: Date): Promise<JournalOutflows> {
  const dateFilter = { gte: from, ...(to ? { lte: to } : {}) };
  const [expenses, advances] = await Promise.all([
    prisma.expense
      .findMany({ where: { date: dateFilter }, select: { amount: true, paymentMethod: true } })
      .catch((err) => {
        console.error("[finance] expense lookup failed", err);
        return [] as { amount: number; paymentMethod: string }[];
      }),
    prisma.advance
      .findMany({ where: { date: dateFilter }, select: { amount: true, paymentMethod: true } })
      .catch((err) => {
        console.error("[finance] advance lookup failed", err);
        return [] as { amount: number; paymentMethod: string }[];
      }),
  ]);

  const out = { ...EMPTY_OUTFLOWS };
  for (const e of expenses) {
    if (e.paymentMethod === "CARD") out.cardExpenses += e.amount;
    else out.cashExpenses += e.amount;
    out.expensesTotal += e.amount;
  }
  for (const a of advances) {
    if (a.paymentMethod === "CARD") out.cardAdvances += a.amount;
    else out.cashAdvances += a.amount;
    out.advancesTotal += a.amount;
  }
  return out;
}
