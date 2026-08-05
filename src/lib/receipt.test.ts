import { describe, it, expect } from 'vitest';
import { buildWhatsAppText, ReceiptShopSettings, ReceiptVisit } from './receipt';

function baseShop(overrides: Partial<ReceiptShopSettings> = {}): ReceiptShopSettings {
  return {
    shopName: 'Escape Barbershop',
    shopPhone: null,
    shopAddress: null,
    receiptFooter: null,
    shopLogo: null,
    ...overrides,
  };
}

function baseVisit(overrides: Partial<ReceiptVisit> = {}): ReceiptVisit {
  return {
    id: 'visit-0000000000abcdef1234',
    visitAt: '2026-01-01T10:00:00.000Z',
    customer: { name: 'Karim', phone: null },
    barber: { name: 'Ahmed' },
    paymentMethod: 'CASH',
    cashAmount: 50,
    cardAmount: null,
    discount: 0,
    total: 50,
    notes: null,
    sessionSequence: null,
    items: [{ service: { name: 'Haircut', arabicName: null }, quantity: 1, priceAtTime: 50 }],
    ...overrides,
  };
}

describe('buildWhatsAppText', () => {
  it('includes the shop name, barber name, and total for a simple visit', () => {
    const text = buildWhatsAppText(baseVisit(), baseShop());
    expect(text).toContain('Escape Barbershop');
    expect(text).toContain('Ahmed');
    expect(text).toContain('Total');
  });

  it('derives the receipt number from the last 8 characters of the visit id, uppercased', () => {
    const text = buildWhatsAppText(baseVisit({ id: 'visit-abc123def456' }), baseShop());
    expect(text).toContain('Receipt #23DEF456');
  });

  it('shows a quantity marker only when a service is ordered more than once', () => {
    const single = buildWhatsAppText(
      baseVisit({ items: [{ service: { name: 'Shave', arabicName: null }, quantity: 1, priceAtTime: 30 }] }),
      baseShop()
    );
    const multiple = buildWhatsAppText(
      baseVisit({ items: [{ service: { name: 'Shave', arabicName: null }, quantity: 2, priceAtTime: 30 }] }),
      baseShop()
    );
    expect(single).not.toContain('×');
    expect(multiple).toContain('×2');
  });

  it('omits the subtotal and discount lines when there is no discount', () => {
    const text = buildWhatsAppText(baseVisit({ discount: 0 }), baseShop());
    expect(text).not.toContain('Discount');
    expect(text).not.toContain('Subtotal');
  });

  it('includes subtotal and discount lines when a discount is applied', () => {
    const text = buildWhatsAppText(baseVisit({ discount: 10, total: 45 }), baseShop());
    expect(text).toContain('Subtotal');
    expect(text).toContain('Discount (10%)');
  });

  it('labels the payment method as Cash, Card, or Mixed', () => {
    expect(buildWhatsAppText(baseVisit({ paymentMethod: 'CASH' }), baseShop())).toContain('Payment: Cash');
    expect(buildWhatsAppText(baseVisit({ paymentMethod: 'CARD' }), baseShop())).toContain('Payment: Card');
    expect(buildWhatsAppText(baseVisit({ paymentMethod: 'MIXED' }), baseShop())).toContain('Payment: Mixed');
  });

  it('falls back to an em dash placeholder when there is no assigned barber', () => {
    const withBarber = buildWhatsAppText(baseVisit({ barber: { name: 'Ahmed' } }), baseShop());
    const withoutBarber = buildWhatsAppText(baseVisit({ barber: null }), baseShop());
    expect(withBarber).toContain('Barber: Ahmed');
    expect(withoutBarber).toContain('Barber: —');
  });

  it('appends the shop receipt footer only when one is configured', () => {
    const withoutFooter = buildWhatsAppText(baseVisit(), baseShop({ receiptFooter: null }));
    const withFooter = buildWhatsAppText(baseVisit(), baseShop({ receiptFooter: 'Thank you for visiting!' }));
    expect(withoutFooter).not.toContain('Thank you for visiting!');
    expect(withFooter).toContain('Thank you for visiting!');
  });
});
