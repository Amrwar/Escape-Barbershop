/**
 * How a customer paid for a visit. Safe to import from the browser.
 *
 *  - CASH      goes into the drawer.
 *  - CARD      goes through the Visa machine, which takes its commission.
 *  - INSTAPAY  is a bank transfer: no commission, and it never touches the drawer.
 *  - MIXED     is any combination of the three, each part stored in its own column.
 *
 * The tip is stored apart from these amounts. When it was not handed over in
 * cash, the barber is paid it out of the drawer instead (see tipPaidInCash).
 */

export const VISIT_PAYMENT_METHODS = ["CASH", "CARD", "INSTAPAY", "MIXED"] as const;
export type VisitPaymentMethod = (typeof VISIT_PAYMENT_METHODS)[number];

export interface PaymentSplit {
  cash: number;
  card: number;
  instapay: number;
}

export interface PaidVisit {
  paymentMethod: string;
  total: number;
  cashAmount: number | null;
  cardAmount: number | null;
  instapayAmount?: number | null;
  tip?: number | null;
}

/** What a visit's total (tip excluded) came in as. */
export function paymentSplit(v: PaidVisit): PaymentSplit {
  switch (v.paymentMethod) {
    case "CARD":
      return { cash: 0, card: v.cardAmount ?? v.total, instapay: 0 };
    case "INSTAPAY":
      return { cash: 0, card: 0, instapay: v.instapayAmount ?? v.total };
    case "MIXED":
      return { cash: v.cashAmount ?? 0, card: v.cardAmount ?? 0, instapay: v.instapayAmount ?? 0 };
    default:
      return { cash: v.cashAmount ?? v.total, card: 0, instapay: 0 };
  }
}

/**
 * Whether the tip arrived as cash in the drawer. A mixed payment counts as cash
 * only when part of it was cash; otherwise the tip came by card or transfer.
 */
export function tipPaidInCash(v: Pick<PaidVisit, "paymentMethod" | "cashAmount">): boolean {
  return v.paymentMethod === "CASH" || (v.paymentMethod === "MIXED" && (v.cashAmount ?? 0) > 0);
}

export interface PaymentTotals extends PaymentSplit {
  /** Tips that came in as cash, so they sit in the drawer on top of `cash`. */
  cashTips: number;
}

export function sumPayments(visits: PaidVisit[]): PaymentTotals {
  const out: PaymentTotals = { cash: 0, card: 0, instapay: 0, cashTips: 0 };
  for (const v of visits) {
    const s = paymentSplit(v);
    out.cash += s.cash;
    out.card += s.card;
    out.instapay += s.instapay;
    if (tipPaidInCash(v)) out.cashTips += v.tip ?? 0;
  }
  return out;
}

/**
 * A drawer session's takings, with the mixed payments kept apart the way the
 * drawer screens list them. Cash figures include the tips handed over in cash;
 * the other tips were paid out of the drawer as a movement when the visit was saved.
 */
export function drawerSales(visits: PaidVisit[]) {
  const single = sumPayments(visits.filter((v) => v.paymentMethod !== "MIXED"));
  const mixed = sumPayments(visits.filter((v) => v.paymentMethod === "MIXED"));
  const cashTotal = single.cash + single.cashTips;
  const mixedCash = mixed.cash + mixed.cashTips;
  return {
    cashTotal,
    cardTotal: single.card,
    instapayTotal: single.instapay,
    mixedCash,
    mixedCard: mixed.card,
    mixedInstapay: mixed.instapay,
    cashSales: cashTotal + mixedCash,
    cardSales: single.card + mixed.card,
    instapaySales: single.instapay + mixed.instapay,
  };
}

/**
 * The amounts to store for a new or edited visit. A mixed payment must add up
 * to the total; null means it does not.
 */
export function resolvePaymentAmounts(
  method: VisitPaymentMethod,
  total: number,
  entered: { cashAmount?: number; cardAmount?: number; instapayAmount?: number }
): { cashAmount: number; cardAmount: number; instapayAmount: number } | null {
  switch (method) {
    case "CASH":
      return { cashAmount: total, cardAmount: 0, instapayAmount: 0 };
    case "CARD":
      return { cashAmount: 0, cardAmount: total, instapayAmount: 0 };
    case "INSTAPAY":
      return { cashAmount: 0, cardAmount: 0, instapayAmount: total };
    case "MIXED": {
      const amounts = {
        cashAmount: entered.cashAmount ?? 0,
        cardAmount: entered.cardAmount ?? 0,
        instapayAmount: entered.instapayAmount ?? 0,
      };
      // Compared in piastres so a three-way split of an odd total is not refused.
      const sum = amounts.cashAmount + amounts.cardAmount + amounts.instapayAmount;
      return Math.abs(Math.round(sum * 100) - Math.round(total * 100)) <= 1 ? amounts : null;
    }
  }
}

/** Translation key for a payment method's name. */
export function paymentMethodKey(method: string) {
  return method === "CARD"
    ? "common.card"
    : method === "INSTAPAY"
      ? "common.instapay"
      : method === "MIXED"
        ? "common.mixed"
        : "common.cash";
}

/** Badge colour per payment method, shared by every list that shows one. */
export const PAYMENT_BADGE: Record<string, "green" | "blue" | "purple" | "yellow"> = {
  CASH: "green",
  CARD: "blue",
  INSTAPAY: "purple",
  MIXED: "yellow",
};

/** English name, for receipts and exports. */
export function paymentMethodName(method: string): string {
  return method === "CARD" ? "Card" : method === "INSTAPAY" ? "InstaPay" : method === "MIXED" ? "Mixed" : "Cash";
}
