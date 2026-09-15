import { describe, it, expect } from 'vitest';
import { paymentSplit, resolvePaymentAmounts, sumPayments, tipPaidInCash, type PaidVisit } from './payments';

function visit(overrides: Partial<PaidVisit> = {}): PaidVisit {
  return { paymentMethod: 'CASH', total: 100, cashAmount: null, cardAmount: null, instapayAmount: null, tip: 0, ...overrides };
}

describe('paymentSplit', () => {
  it('puts a single-method visit entirely on that method', () => {
    expect(paymentSplit(visit())).toEqual({ cash: 100, card: 0, instapay: 0 });
    expect(paymentSplit(visit({ paymentMethod: 'CARD' }))).toEqual({ cash: 0, card: 100, instapay: 0 });
    expect(paymentSplit(visit({ paymentMethod: 'INSTAPAY' }))).toEqual({ cash: 0, card: 0, instapay: 100 });
  });

  it('reads each part of a mixed payment', () => {
    const v = visit({ paymentMethod: 'MIXED', cashAmount: 20, cardAmount: 30, instapayAmount: 50 });
    expect(paymentSplit(v)).toEqual({ cash: 20, card: 30, instapay: 50 });
  });

  it('reads a cash and card mix saved before InstaPay existed', () => {
    const v = visit({ paymentMethod: 'MIXED', cashAmount: 40, cardAmount: 60, instapayAmount: undefined });
    expect(paymentSplit(v)).toEqual({ cash: 40, card: 60, instapay: 0 });
  });
});

describe('tipPaidInCash', () => {
  it('counts the tip as drawer cash only when cash was part of the payment', () => {
    expect(tipPaidInCash(visit())).toBe(true);
    expect(tipPaidInCash(visit({ paymentMethod: 'MIXED', cashAmount: 10 }))).toBe(true);
    expect(tipPaidInCash(visit({ paymentMethod: 'MIXED', cashAmount: 0 }))).toBe(false);
    expect(tipPaidInCash(visit({ paymentMethod: 'CARD' }))).toBe(false);
    expect(tipPaidInCash(visit({ paymentMethod: 'INSTAPAY' }))).toBe(false);
  });
});

describe('sumPayments', () => {
  it('adds up each method and only the tips that reached the drawer', () => {
    const totals = sumPayments([
      visit({ tip: 10 }),
      visit({ paymentMethod: 'INSTAPAY', tip: 5 }),
      visit({ paymentMethod: 'MIXED', cashAmount: 50, cardAmount: 0, instapayAmount: 50, tip: 3 }),
    ]);
    expect(totals).toEqual({ cash: 150, card: 0, instapay: 150, cashTips: 13 });
  });
});

describe('resolvePaymentAmounts', () => {
  it('stores the whole total on a single method', () => {
    expect(resolvePaymentAmounts('INSTAPAY', 80, {})).toEqual({ cashAmount: 0, cardAmount: 0, instapayAmount: 80 });
  });

  it('keeps a mixed split that adds up', () => {
    expect(resolvePaymentAmounts('MIXED', 100, { cashAmount: 25, cardAmount: 25, instapayAmount: 50 })).toEqual({
      cashAmount: 25,
      cardAmount: 25,
      instapayAmount: 50,
    });
  });

  it('rejects a mixed split that does not add up', () => {
    expect(resolvePaymentAmounts('MIXED', 100, { cashAmount: 25, instapayAmount: 50 })).toBeNull();
  });

  it('tolerates rounding to the piastre', () => {
    expect(resolvePaymentAmounts('MIXED', 100, { cashAmount: 33.33, cardAmount: 33.33, instapayAmount: 33.33 })).not.toBeNull();
  });
});
