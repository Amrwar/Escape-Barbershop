import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { getRequest, jsonRequest, seedShop, staffSession, type Shop } from "./fixtures";
import { POST as createVisit } from "@/app/api/visits/route";
import { DELETE as removeVisit } from "@/app/api/visits/[id]/route";
import { GET as balances } from "@/app/api/stock/balances/route";
import { GET as drawer, POST as openDrawer } from "@/app/api/cash-drawer/route";
import { GET as reports } from "@/app/api/reports/route";

/**
 * Selling a bottle of something over the counter.
 *
 * The shop could always buy stock and use it on the floor; what it could not do
 * was sell it and have the money show up. The rules that matter: the takings
 * and the shelf move in the same transaction, the till cannot sell what is not
 * there, and undoing a visit puts the stock back.
 */

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("./db")).testPrisma() }));

let session: unknown = null;
vi.mock("next-auth", () => ({ getServerSession: async () => session }));

let shop: Shop;
let oil: string;
let bleach: string;

beforeAll(() => startTestDatabase());

beforeEach(async () => {
  await resetDatabase();
  shop = await seedShop();
  session = staffSession(shop.cashier.id, "CASHIER");

  const [forSale, forTheFloor] = await Promise.all([
    testPrisma().product.create({ data: { name: "Beard oil", unit: "bottle", costPrice: 60, salePrice: 180 } }),
    // Bought for the floor, never sold: no sale price on it.
    testPrisma().product.create({ data: { name: "Bleach powder", unit: "tub", costPrice: 400, salePrice: 0 } }),
  ]);
  oil = forSale.id;
  bleach = forTheFloor.id;
});

/** Put stock on the branch shelf, the way a transfer would. */
async function stockUp(productId: string, quantity: number) {
  await testPrisma().stockMovement.create({
    data: { productId, date: new Date(), location: "BRANCH", type: "TRANSFER_IN", quantity },
  });
}

const sell = (products: { productId: string; quantity: number; unitPrice: number }[], discount = 0) =>
  createVisit(
    jsonRequest("/api/visits", {
      customerId: shop.customer.id,
      barberId: shop.barbers.abdullah,
      visitAt: new Date().toISOString(),
      paymentMethod: "CASH",
      discount,
      tip: 0,
      items: [{ serviceId: shop.services.haircut, quantity: 1, priceAtTime: 150 }],
      products,
    })
  );

async function branchStock(productId: string) {
  const rows = await (await balances(getRequest("/api/stock/balances"))).json();
  const list = Array.isArray(rows) ? rows : rows.rows ?? [];
  const row = list.find((r: { id?: string; productId?: string }) => (r.id ?? r.productId) === productId);
  return row?.branch ?? 0;
}

describe("selling a product with a haircut", () => {
  it("puts the money on the visit and takes the bottle off the shelf", async () => {
    await stockUp(oil, 10);

    const res = await sell([{ productId: oil, quantity: 2, unitPrice: 180 }]);
    expect(res.status).toBe(201);

    const visit = await res.json();
    expect(visit.total).toBe(510); // 150 haircut + 360 of oil
    expect(visit.products).toHaveLength(1);
    expect(await branchStock(oil)).toBe(8);
  });

  it("copies in the name and the cost, so a later price change never rewrites it", async () => {
    await stockUp(oil, 5);
    await sell([{ productId: oil, quantity: 1, unitPrice: 180 }]);

    await testPrisma().product.update({ where: { id: oil }, data: { salePrice: 250, costPrice: 90, name: "Beard oil XL" } });

    const line = await testPrisma().visitProduct.findFirstOrThrow();
    expect(line.name).toBe("Beard oil");
    expect(line.unitPrice).toBe(180);
    expect(line.unitCost).toBe(60);
  });

  it("takes the price the cashier actually charged", async () => {
    await stockUp(oil, 5);
    const visit = await (await sell([{ productId: oil, quantity: 1, unitPrice: 150 }])).json();
    expect(visit.total).toBe(300); // 150 + 150
  });

  it("does not take the haircut's discount off the bottle too", async () => {
    await stockUp(oil, 5);
    // Half off the haircut only: 75 + 180.
    const visit = await (await sell([{ productId: oil, quantity: 1, unitPrice: 180 }], 50)).json();
    expect(visit.total).toBe(255);
  });

  it("lands in the drawer with the rest of the day's cash", async () => {
    session = staffSession(shop.owner.id);
    await openDrawer(jsonRequest("/api/cash-drawer", { openingCash: 1000 }));
    await stockUp(oil, 5);
    await sell([{ productId: oil, quantity: 1, unitPrice: 180 }]);

    const body = await (await drawer()).json();
    expect(body.visitSummary.cashSales).toBe(330); // 150 + 180
    expect(body.visitSummary.expectedCash).toBe(1330);
  });
});

describe("what the till refuses to sell", () => {
  it("more bottles than the shelf holds", async () => {
    await stockUp(oil, 1);

    const res = await sell([{ productId: oil, quantity: 3, unitPrice: 180 }]);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("product_problem");

    // And nothing happened: no visit, no stock movement.
    expect(await testPrisma().visit.count()).toBe(0);
    expect(await branchStock(oil)).toBe(1);
  });

  it("something the shop only uses on the floor", async () => {
    await stockUp(bleach, 10);

    const res = await sell([{ productId: bleach, quantity: 1, unitPrice: 500 }]);
    expect(res.status).toBe(409);
    expect((await res.json()).problems[0].problem).toBe("not-for-sale");
  });

  it("something it does not stock at all", async () => {
    const res = await sell([{ productId: "nothing-like-it", quantity: 1, unitPrice: 10 }]);
    expect(res.status).toBe(409);
    expect((await res.json()).problems[0].problem).toBe("unknown");
  });

  it("a quantity that is not a quantity", async () => {
    await stockUp(oil, 5);
    const res = await sell([{ productId: oil, quantity: 0, unitPrice: 180 }]);
    // Refused by the shape of the request itself.
    expect([400, 409]).toContain(res.status);
    expect(await testPrisma().visit.count()).toBe(0);
  });
});

describe("undoing a sale", () => {
  it("puts the stock back where it was", async () => {
    await stockUp(oil, 10);
    const visit = await (await sell([{ productId: oil, quantity: 3, unitPrice: 180 }])).json();
    expect(await branchStock(oil)).toBe(7);

    session = staffSession(shop.owner.id);
    await removeVisit(getRequest(`/api/visits/${visit.id}`), { params: { id: visit.id } });

    expect(await branchStock(oil)).toBe(10);
    expect(await testPrisma().visitProduct.count()).toBe(0);
  });

  it("remembers in the activity log what was sold on it", async () => {
    await stockUp(oil, 5);
    const visit = await (await sell([{ productId: oil, quantity: 2, unitPrice: 180 }])).json();

    session = staffSession(shop.owner.id);
    await removeVisit(getRequest(`/api/visits/${visit.id}`), { params: { id: visit.id } });

    const entry = await testPrisma().auditLog.findFirstOrThrow({ where: { entity: "VISIT", action: "DELETE" } });
    expect(entry.details).toContain("Beard oil");
  });
});

describe("what the report says about the counter", () => {
  it("breaks the product money and its cost out of the takings", async () => {
    session = staffSession(shop.owner.id);
    await stockUp(oil, 10);
    await sell([{ productId: oil, quantity: 2, unitPrice: 180 }]);

    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 86_400_000).toISOString();
    const { summary } = await (await reports(getRequest(`/api/reports?from=${from}&to=${to}`))).json();

    expect(summary.totalRevenue).toBe(510); // the haircut and the oil together
    expect(summary.productRevenue).toBe(360);
    expect(summary.productCost).toBe(120); // two bottles at 60
    expect(summary.productsSold).toBe(2);
  });

  it("says nothing sold on a day nothing was", async () => {
    session = staffSession(shop.owner.id);
    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 86_400_000).toISOString();
    const { summary } = await (await reports(getRequest(`/api/reports?from=${from}&to=${to}`))).json();

    expect(summary.productRevenue).toBe(0);
    expect(summary.productsSold).toBe(0);
  });
});

describe("a visit with no products at all", () => {
  it("works exactly as it always did", async () => {
    const res = await createVisit(
      jsonRequest("/api/visits", {
        customerId: shop.customer.id,
        barberId: shop.barbers.abdullah,
        visitAt: new Date().toISOString(),
        paymentMethod: "CASH",
        discount: 0,
        tip: 0,
        items: [{ serviceId: shop.services.haircut, quantity: 1, priceAtTime: 150 }],
      })
    );

    expect(res.status).toBe(201);
    expect((await res.json()).total).toBe(150);
    expect(await testPrisma().stockMovement.count()).toBe(0);
  });
});
