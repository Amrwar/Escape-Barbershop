/**
 * What a barber has earned. Pure, because the payroll sheet and the barber's
 * own screen must agree to the piastre — and because commission is the sort of
 * arithmetic nobody wants to find wrong at the end of the month.
 *
 * Commission is paid on the services that carry it, with any discount shared
 * across the visit in proportion. A service marked "no commission" earns none,
 * and a discount never quietly comes out of the barber's share alone.
 */

export interface CommissionSettings {
  commissionType: "PERCENT" | "FIXED_PER_VISIT";
  commissionValue: number;
  baseSalary?: number;
}

export interface CountableVisit {
  total: number;
  items: {
    priceAtTime: number;
    quantity: number;
    service: { excludeFromCommission: boolean } | null;
  }[];
}

export interface Earnings {
  visitCount: number;
  visitTotal: number;
  /** The part of the takings that commission is paid on. */
  commissionableTotal: number;
  commission: number;
}

/** The share of a visit that carries commission, after its discount. */
export function commissionableAmount(visit: CountableVisit): number {
  const allSubtotal = visit.items.reduce((s, i) => s + i.priceAtTime * i.quantity, 0);
  const carrying = visit.items
    .filter((i) => !i.service?.excludeFromCommission)
    .reduce((s, i) => s + i.priceAtTime * i.quantity, 0);
  // The discount is shared across everything, so the excluded services take
  // their part of it too.
  const discountFactor = allSubtotal > 0 ? visit.total / allSubtotal : 1;
  return carrying * discountFactor;
}

export function earningsFor(visits: CountableVisit[], settings?: CommissionSettings | null): Earnings {
  const visitCount = visits.length;
  const visitTotal = visits.reduce((s, v) => s + v.total, 0);
  const commissionableTotal = visits.reduce((s, v) => s + commissionableAmount(v), 0);

  let commission = 0;
  if (settings) {
    commission =
      settings.commissionType === "PERCENT"
        ? (commissionableTotal * settings.commissionValue) / 100
        : visitCount * settings.commissionValue;
  }

  return { visitCount, visitTotal, commissionableTotal, commission };
}

/** Tips belong to the barber and are not commission: they are counted apart. */
export function tipsFor(visits: { tip?: number | null }[]): number {
  return visits.reduce((s, v) => s + (v.tip ?? 0), 0);
}
