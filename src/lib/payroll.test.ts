import { describe, it, expect } from 'vitest';
import { commissionableAmount, earningsFor, tipsFor, type CountableVisit } from './payroll';

const item = (price: number, excluded = false, quantity = 1) => ({
  priceAtTime: price,
  quantity,
  service: { excludeFromCommission: excluded },
});

const visit = (overrides: Partial<CountableVisit> = {}): CountableVisit => ({
  total: 200,
  items: [item(200)],
  ...overrides,
});

describe('commissionableAmount', () => {
  it('is the whole visit when everything carries commission', () => {
    expect(commissionableAmount(visit())).toBe(200);
  });

  it('leaves out the services the shop excludes', () => {
    const v = visit({ total: 300, items: [item(200), item(100, true)] });
    expect(commissionableAmount(v)).toBe(200);
  });

  it('shares a discount across everything, excluded services included', () => {
    // 300 of services, 10% off, so the visit is 270. The commissionable 200
    // carries its own tenth of the discount: 180, not 170.
    const v = visit({ total: 270, items: [item(200), item(100, true)] });
    expect(commissionableAmount(v)).toBe(180);
  });

  it('counts quantity', () => {
    const v = visit({ total: 400, items: [item(100, false, 4)] });
    expect(commissionableAmount(v)).toBe(400);
  });

  it('copes with a visit given away for nothing', () => {
    const v = visit({ total: 0, items: [item(200)] });
    expect(commissionableAmount(v)).toBe(0);
  });

  it('does not divide by nothing when a visit has no priced lines', () => {
    const v = visit({ total: 0, items: [] });
    expect(commissionableAmount(v)).toBe(0);
  });

  it('treats a missing service as one that carries commission', () => {
    const v = visit({ total: 100, items: [{ priceAtTime: 100, quantity: 1, service: null }] });
    expect(commissionableAmount(v)).toBe(100);
  });
});

describe('earningsFor', () => {
  it('pays a percentage of the commissionable takings', () => {
    const earnings = earningsFor([visit(), visit()], { commissionType: 'PERCENT', commissionValue: 10 });
    expect(earnings.visitCount).toBe(2);
    expect(earnings.visitTotal).toBe(400);
    expect(earnings.commissionableTotal).toBe(400);
    expect(earnings.commission).toBe(40);
  });

  it('pays a fixed amount per visit, whatever they were worth', () => {
    const earnings = earningsFor([visit(), visit({ total: 50, items: [item(50)] })], {
      commissionType: 'FIXED_PER_VISIT',
      commissionValue: 25,
    });
    expect(earnings.commission).toBe(50);
  });

  it('pays nothing when the barber has no commission set up', () => {
    expect(earningsFor([visit()], null).commission).toBe(0);
  });

  it('is all zeroes for a barber with no visits', () => {
    expect(earningsFor([], { commissionType: 'PERCENT', commissionValue: 10 })).toEqual({
      visitCount: 0,
      visitTotal: 0,
      commissionableTotal: 0,
      commission: 0,
    });
  });

  it('does not pay commission on an excluded service', () => {
    const earnings = earningsFor([visit({ total: 100, items: [item(100, true)] })], {
      commissionType: 'PERCENT',
      commissionValue: 10,
    });
    expect(earnings.visitTotal).toBe(100);
    expect(earnings.commissionableTotal).toBe(0);
    expect(earnings.commission).toBe(0);
  });
});

describe('tipsFor', () => {
  it('adds up the tips, which are not commission', () => {
    expect(tipsFor([{ tip: 20 }, { tip: 0 }, {}, { tip: null }])).toBe(20);
  });
});
