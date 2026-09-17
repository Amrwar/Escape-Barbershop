import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { getRequest, seedShop, staffSession, type Shop } from "./fixtures";
import { GET as insights } from "@/app/api/reports/insights/route";

/**
 * The owner's read of the shop. Two things matter beyond the arithmetic, which
 * is tested on its own: only the owner may ask, and a customer's history is
 * read from their whole life at the shop rather than from the window.
 */

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("./db")).testPrisma() }));

let session: unknown = null;
vi.mock("next-auth", () => ({ getServerSession: async () => session }));

let shop: Shop;

beforeAll(() => startTestDatabase());

beforeEach(async () => {
  await resetDatabase();
  shop = await seedShop();
  session = staffSession(shop.owner.id);
});

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

async function visit(customerId: string, when: Date, total = 150, barberId: string | null = shop.barbers.abdullah) {
  return testPrisma().visit.create({
    data: { customerId, barberId, visitAt: when, total, paymentMethod: "CASH", cashAmount: total },
  });
}

const ask = (days = 90) =>
  insights(
    getRequest(
      `/api/reports/insights?from=${daysAgo(days).toISOString()}&to=${new Date().toISOString()}`
    )
  );

describe("who may read the shop", () => {
  it("is the owner's screen", async () => {
    expect((await ask()).status).toBe(200);
  });

  it("is not the cashier's", async () => {
    session = staffSession(shop.cashier.id, "CASHIER");
    expect((await ask()).status).toBe(401);
  });

  it("is nobody else's at all", async () => {
    session = null;
    expect((await ask()).status).toBe(401);
  });
});

describe("what it counts", () => {
  it("adds up the visits and takings inside the window only", async () => {
    await visit(shop.customer.id, daysAgo(5), 200);
    await visit(shop.customer.id, daysAgo(10), 100);
    await visit(shop.customer.id, daysAgo(200), 999); // long before the window

    const body = await (await ask(90)).json();
    expect(body.visits).toBe(2);
    expect(body.takings).toBe(300);
  });

  it("does not mistake an old customer for a new face", async () => {
    // Their first visit was two years ago; this month's visit is a return.
    await visit(shop.customer.id, daysAgo(700));
    await visit(shop.customer.id, daysAgo(3));

    const body = await (await ask(30)).json();
    expect(body.newVersusReturning).toMatchObject({ fresh: 0, returning: 1 });
  });

  it("counts a genuinely first visit as a new face", async () => {
    await visit(shop.customer.id, daysAgo(3));
    const body = await (await ask(30)).json();
    expect(body.newVersusReturning.fresh).toBe(1);
    expect(body.newVersusReturning.freshPercent).toBe(100);
  });

  it("splits the work between barbers", async () => {
    await visit(shop.customer.id, daysAgo(2), 300, shop.barbers.khaled);
    await visit(shop.customer.id, daysAgo(4), 100, shop.barbers.abdullah);

    const body = await (await ask()).json();
    expect(body.barbers[0]).toMatchObject({ name: "Khaled", visits: 1, takings: 300, share: 75 });
    expect(body.barbers[1]).toMatchObject({ name: "Abdullah", takings: 100, share: 25 });
  });

  it("names the regulars who have drifted off, with a way to ring them", async () => {
    const lapsed = await testPrisma().customer.create({ data: { name: "Lapsed Regular", phone: "01000000001" } });
    await visit(lapsed.id, daysAgo(400));
    await visit(lapsed.id, daysAgo(120));
    // Still current: two visits, one of them recent.
    await visit(shop.customer.id, daysAgo(90));
    await visit(shop.customer.id, daysAgo(4));

    const body = await (await ask()).json();
    expect(body.retention.slippingCount).toBe(1);
    expect(body.retention.slipping[0]).toMatchObject({ name: "Lapsed Regular", phone: "01000000001" });
  });

  it("answers an empty shop without dividing by nothing", async () => {
    const body = await (await ask()).json();
    expect(body).toMatchObject({ visits: 0, takings: 0 });
    expect(body.newVersusReturning.freshPercent).toBe(0);
    expect(body.retention.medianGapDays).toBeNull();
  });

  it("refuses dates that are not dates", async () => {
    const res = await insights(getRequest("/api/reports/insights?from=yesterday&to=soon"));
    expect(res.status).toBe(400);
  });
});
