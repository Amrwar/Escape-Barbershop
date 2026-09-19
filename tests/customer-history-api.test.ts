import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { customerSession, getRequest, seedCustomerLogin, seedShop, type Shop } from "./fixtures";
import { GET as myVisits } from "@/app/api/customer/visits/route";

/**
 * A customer's own haircuts.
 *
 * The shop has years of these and the customer has never been able to see one.
 * Two things matter: they see all of theirs, and none of anybody else's — and
 * what comes back is the haircut, not the shop's books. A customer has no
 * business knowing the tip their barber got or the discount the owner chose.
 */

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("./db")).testPrisma() }));

let session: unknown = null;
vi.mock("next-auth", () => ({ getServerSession: async () => session }));

let shop: Shop;
let login: { id: string; customerId: string };

beforeAll(() => startTestDatabase());

beforeEach(async () => {
  await resetDatabase();
  shop = await seedShop();
  login = await seedCustomerLogin(shop.customer.id);
  session = customerSession(login.id, login.customerId);
});

async function visit({
  daysAgo = 7,
  total = 150,
  customerId = shop.customer.id,
  barberId = shop.barbers.abdullah as string | null,
  tip = 0,
  discount = 0,
}: {
  daysAgo?: number;
  total?: number;
  customerId?: string;
  barberId?: string | null;
  tip?: number;
  discount?: number;
} = {}) {
  return testPrisma().visit.create({
    data: {
      customerId,
      barberId,
      visitAt: new Date(Date.now() - daysAgo * 86_400_000),
      total,
      tip,
      discount,
      items: { create: [{ serviceId: shop.services.haircut, priceAtTime: total, quantity: 1 }] },
    },
  });
}

const read = async (query = "") => (await myVisits(getRequest(`/api/customer/visits${query}`))).json();

describe("a customer's own haircuts", () => {
  it("gives back what they had, who did it and what it cost", async () => {
    await visit({ total: 150 });

    const { visits } = await read();
    expect(visits).toHaveLength(1);
    expect(visits[0].total).toBe(150);
    expect(visits[0].barber.name).toBe("Abdullah");
    expect(visits[0].services[0].name).toBe("Hair cut");
  });

  it("puts the most recent first", async () => {
    await visit({ daysAgo: 30, total: 100 });
    await visit({ daysAgo: 2, total: 200 });

    const { visits } = await read();
    expect(visits.map((v: { total: number }) => v.total)).toEqual([200, 100]);
  });

  it("shows a visit nobody was assigned to", async () => {
    await visit({ barberId: null });
    expect((await read()).visits[0].barber).toBeNull();
  });

  it("carries the rating they left, so they can see what they said", async () => {
    const v = await visit();
    await testPrisma().review.create({
      data: { visitId: v.id, customerId: shop.customer.id, barberId: shop.barbers.abdullah, rating: 5 },
    });

    expect((await read()).visits[0].rating).toBe(5);
  });

  it("lists anything sold over the counter alongside the cut", async () => {
    const v = await visit();
    const product = await testPrisma().product.create({
      data: { name: "Beard oil", salePrice: 120, costPrice: 60 },
    });
    await testPrisma().visitProduct.create({
      data: { visitId: v.id, productId: product.id, name: "Beard oil", quantity: 2, unitPrice: 120, total: 240 },
    });

    const { visits } = await read();
    expect(visits[0].products).toEqual([{ name: "Beard oil", quantity: 2 }]);
  });
});

describe("what it refuses to say", () => {
  it("never shows the tip, the discount or how it was paid", async () => {
    await visit({ tip: 50, discount: 10 });

    // The shop's books are the shop's. A customer wants their haircut back,
    // not the arithmetic behind the counter.
    const body = JSON.stringify(await read());
    for (const word of ["tip", "discount", "cashAmount", "cardAmount", "instapay", "paymentMethod", "sessionId"]) {
      expect(body.toLowerCase()).not.toContain(word.toLowerCase());
    }
  });

  it("shows nobody else's haircuts", async () => {
    const other = await testPrisma().customer.create({ data: { name: "Mahmoud", phone: "01088887777" } });
    await visit({ customerId: other.id });

    expect((await read()).visits).toEqual([]);
  });

  it("turns away anyone not signed in", async () => {
    await visit();
    session = null;
    expect((await myVisits(getRequest("/api/customer/visits"))).status).toBe(401);
  });
});

describe("years of them", () => {
  it("gives a page at a time and says how to ask for the next", async () => {
    for (let i = 1; i <= 25; i++) await visit({ daysAgo: i, total: 100 + i });

    const first = await read();
    expect(first.visits).toHaveLength(20);
    expect(first.nextBefore).not.toBeNull();
  });

  it("continues from where the last page stopped, without repeating one", async () => {
    for (let i = 1; i <= 25; i++) await visit({ daysAgo: i, total: 100 + i });

    const first = await read();
    const second = await read(`?before=${encodeURIComponent(first.nextBefore)}`);

    expect(second.visits).toHaveLength(5);
    const ids = new Set([...first.visits, ...second.visits].map((v: { id: string }) => v.id));
    expect(ids.size).toBe(25);
  });

  it("says there is no more once the history runs out", async () => {
    for (let i = 1; i <= 25; i++) await visit({ daysAgo: i });

    const first = await read();
    const second = await read(`?before=${encodeURIComponent(first.nextBefore)}`);
    expect(second.nextBefore).toBeNull();
  });

  it("does not ask for another page when everything fits on one", async () => {
    await visit();
    expect((await read()).nextBefore).toBeNull();
  });
});
