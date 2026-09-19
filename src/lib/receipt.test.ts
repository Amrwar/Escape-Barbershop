import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildWhatsAppText, joinQrDataUrl, ReceiptShopSettings, ReceiptVisit } from './receipt';

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
    instapayAmount: null,
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

/**
 * The square on the receipt.
 *
 * A receipt is left on a counter, in a pocket, in a bin — and this one already
 * prints the customer's phone number. So the one property that matters is that
 * the code identifies nobody: it is the address of the app and nothing else.
 * Anything in it naming a customer, a visit or a token would be an account
 * handed to whoever picked the paper up.
 */
describe('the join code on a receipt', () => {
  const ORIGIN = 'https://shop.example.com';

  beforeEach(() => {
    vi.stubGlobal('window', { location: { origin: ORIGIN } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** What the QR actually encodes, read back out of the call that drew it. */
  async function decodeTarget(): Promise<string> {
    const QRCode = (await import('qrcode')).default;
    const spy = vi.spyOn(QRCode, 'toDataURL');
    await joinQrDataUrl();
    const target = String(spy.mock.calls[0]?.[0] ?? '');
    spy.mockRestore();
    return target;
  }

  it("points at this shop's own app, wherever it is served", async () => {
    expect(await decodeTarget()).toBe(`${ORIGIN}/app/login?join=1`);
  });

  it('never sends a preview receipt to production, or the other way round', async () => {
    vi.stubGlobal('window', { location: { origin: 'http://localhost:3100' } });
    expect(await decodeTarget()).toBe('http://localhost:3100/app/login?join=1');
  });

  it('carries no customer, no visit and no token — only the address', async () => {
    const target = await decodeTarget();
    const params = new URL(target).searchParams;

    // The only thing it may say is "open the sign-up half".
    expect(Array.from(params.keys())).toEqual(['join']);
    expect(params.get('join')).toBe('1');
    for (const word of ['token', 'customer', 'visit', 'phone', 'claim', 'key', 'id=']) {
      expect(target.toLowerCase()).not.toContain(word);
    }
  });

  it('produces a printable PNG', async () => {
    const url = await joinQrDataUrl();
    expect(url?.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('gives back nothing rather than throwing when it cannot be drawn', async () => {
    const QRCode = (await import('qrcode')).default;
    const spy = vi.spyOn(QRCode, 'toDataURL').mockRejectedValue(new Error('no canvas'));

    // A receipt without the square is still a receipt, and the till must print.
    await expect(joinQrDataUrl()).resolves.toBeNull();
    spy.mockRestore();
  });
});
