import { describe, it, expect } from 'vitest';
import {
  loginSchema,
  customerSchema,
  serviceSchema,
  barberSchema,
  visitItemSchema,
  visitSchema,
  openDrawerSchema,
  closeDrawerSchema,
  cashMovementSchema,
  penaltySchema,
  salarySettingsSchema,
} from './validations';

describe('loginSchema', () => {
  it('accepts a valid email and a 6+ character password', () => {
    const result = loginSchema.safeParse({ email: 'owner@example.com', password: 'secret1' });
    expect(result.success).toBe(true);
  });

  it('rejects a malformed email', () => {
    const result = loginSchema.safeParse({ email: 'not-an-email', password: 'secret1' });
    expect(result.success).toBe(false);
  });

  it('rejects a password shorter than 6 characters', () => {
    const result = loginSchema.safeParse({ email: 'owner@example.com', password: '12345' });
    expect(result.success).toBe(false);
  });
});

describe('customerSchema', () => {
  it('accepts an entirely empty customer (every field optional or blank)', () => {
    const result = customerSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts explicit empty strings for name, phone, and notes', () => {
    const result = customerSchema.safeParse({ name: '', phone: '', notes: '' });
    expect(result.success).toBe(true);
  });

  it('rejects a name longer than 100 characters', () => {
    const result = customerSchema.safeParse({ name: 'a'.repeat(101) });
    expect(result.success).toBe(false);
  });
});

describe('serviceSchema', () => {
  it('accepts a valid service and defaults isActive/excludeFromCommission', () => {
    const result = serviceSchema.safeParse({ name: 'Haircut', defaultPrice: 50 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isActive).toBe(true);
      expect(result.data.excludeFromCommission).toBe(false);
    }
  });

  it('rejects a blank name', () => {
    const result = serviceSchema.safeParse({ name: '', defaultPrice: 50 });
    expect(result.success).toBe(false);
  });

  it('rejects a negative defaultPrice', () => {
    const result = serviceSchema.safeParse({ name: 'Haircut', defaultPrice: -1 });
    expect(result.success).toBe(false);
  });
});

describe('barberSchema', () => {
  it('accepts a valid barber with only a name', () => {
    const result = barberSchema.safeParse({ name: 'Ahmed' });
    expect(result.success).toBe(true);
  });

  it('rejects a blank name', () => {
    const result = barberSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });
});

describe('visitItemSchema and visitSchema', () => {
  it('accepts a valid visit item', () => {
    const result = visitItemSchema.safeParse({ serviceId: 'svc-1', quantity: 1, priceAtTime: 50 });
    expect(result.success).toBe(true);
  });

  it('rejects a quantity of zero', () => {
    const result = visitItemSchema.safeParse({ serviceId: 'svc-1', quantity: 0, priceAtTime: 50 });
    expect(result.success).toBe(false);
  });

  it('rejects a non-integer quantity', () => {
    const result = visitItemSchema.safeParse({ serviceId: 'svc-1', quantity: 1.5, priceAtTime: 50 });
    expect(result.success).toBe(false);
  });

  it('accepts a full visit with at least one item, defaulting discount and tip to 0', () => {
    const result = visitSchema.safeParse({
      customerId: 'cust-1',
      barberId: 'barber-1',
      paymentMethod: 'CASH',
      items: [{ serviceId: 'svc-1', quantity: 1, priceAtTime: 50 }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.discount).toBe(0);
      expect(result.data.tip).toBe(0);
    }
  });

  it('rejects a visit with zero items', () => {
    const result = visitSchema.safeParse({
      customerId: 'cust-1',
      barberId: 'barber-1',
      paymentMethod: 'CASH',
      items: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a discount over 100', () => {
    const result = visitSchema.safeParse({
      customerId: 'cust-1',
      barberId: 'barber-1',
      paymentMethod: 'CASH',
      discount: 101,
      items: [{ serviceId: 'svc-1', quantity: 1, priceAtTime: 50 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid paymentMethod', () => {
    const result = visitSchema.safeParse({
      customerId: 'cust-1',
      barberId: 'barber-1',
      paymentMethod: 'CRYPTO',
      items: [{ serviceId: 'svc-1', quantity: 1, priceAtTime: 50 }],
    });
    expect(result.success).toBe(false);
  });
});

describe('openDrawerSchema and closeDrawerSchema', () => {
  it('accepts a valid opening cash amount', () => {
    expect(openDrawerSchema.safeParse({ openingCash: 500 }).success).toBe(true);
  });

  it('rejects a negative opening cash amount', () => {
    expect(openDrawerSchema.safeParse({ openingCash: -1 }).success).toBe(false);
  });

  it('accepts a valid closing cash count', () => {
    expect(closeDrawerSchema.safeParse({ closingCashCounted: 700 }).success).toBe(true);
  });

  it('rejects a negative closing cash count', () => {
    expect(closeDrawerSchema.safeParse({ closingCashCounted: -1 }).success).toBe(false);
  });
});

describe('cashMovementSchema', () => {
  it('accepts a valid IN movement', () => {
    const result = cashMovementSchema.safeParse({ type: 'IN', amount: 100, reason: 'Change fund top-up' });
    expect(result.success).toBe(true);
  });

  it('rejects a zero amount', () => {
    const result = cashMovementSchema.safeParse({ type: 'OUT', amount: 0, reason: 'Supplies' });
    expect(result.success).toBe(false);
  });

  it('rejects a type outside IN/OUT', () => {
    const result = cashMovementSchema.safeParse({ type: 'TRANSFER', amount: 100, reason: 'Supplies' });
    expect(result.success).toBe(false);
  });

  it('rejects a blank reason', () => {
    const result = cashMovementSchema.safeParse({ type: 'IN', amount: 100, reason: '' });
    expect(result.success).toBe(false);
  });
});

describe('penaltySchema', () => {
  it('accepts a valid penalty', () => {
    const result = penaltySchema.safeParse({
      barberId: 'barber-1',
      date: '2026-01-01',
      amount: 50,
      reason: 'Late arrival',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a zero amount', () => {
    const result = penaltySchema.safeParse({
      barberId: 'barber-1',
      date: '2026-01-01',
      amount: 0,
      reason: 'Late arrival',
    });
    expect(result.success).toBe(false);
  });
});

describe('salarySettingsSchema', () => {
  it('accepts valid percent-based commission settings', () => {
    const result = salarySettingsSchema.safeParse({
      baseSalary: 3000,
      commissionType: 'PERCENT',
      commissionValue: 10,
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid fixed-per-visit commission settings', () => {
    const result = salarySettingsSchema.safeParse({
      baseSalary: 3000,
      commissionType: 'FIXED_PER_VISIT',
      commissionValue: 15,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown commissionType', () => {
    const result = salarySettingsSchema.safeParse({
      baseSalary: 3000,
      commissionType: 'BONUS',
      commissionValue: 15,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a negative baseSalary', () => {
    const result = salarySettingsSchema.safeParse({
      baseSalary: -1,
      commissionType: 'PERCENT',
      commissionValue: 10,
    });
    expect(result.success).toBe(false);
  });
});
