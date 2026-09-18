import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { customerSession, jsonRequest, seedCustomerLogin, seedShop, type Shop } from "./fixtures";
import { GET as listMine, POST as leaveReview } from "@/app/api/customer/reviews/route";
import { REVIEW_WINDOW_DAYS } from "@/lib/reviews";

/**
 * Reviewing a walk-in.
 *
 * This shop books almost nothing and rings up over a thousand visits a month,
 * so a review that only understood appointments was a review nobody here could
 * leave. A review now hangs off whichever the cut was — and off exactly one, so
 * a cut carries one opinion and no more.
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

/** A cut that walked in and was rung up at the till. */
async function walkIn({
  hoursAgo = 3,
  barberId = shop.barbers.abdullah as string | null,
  customerId = shop.customer.id,
}: { hoursAgo?: number; barberId?: string | null; customerId?: string } = {}) {
  return testPrisma().visit.create({
    data: {
      customerId,
      barberId,
      visitAt: new Date(Date.now() - hoursAgo * 3_600_000),
      total: 150,
      items: { create: [{ serviceId: shop.services.haircut, priceAtTime: 150, quantity: 1 }] },
    },
  });
}

/** A booked cut, for the cases where the two must not be confused. */
async function booked(hoursAgo = 3) {
  const start = new Date(Date.now() - hoursAgo * 3_600_000);
  return testPrisma().appointment.create({
    data: {
      customerId: shop.customer.id,
      barberId: shop.barbers.abdullah,
      startAt: start,
      endAt: new Date(start.getTime() + 30 * 60_000),
      durationMinutes: 30,
      totalPrice: 150,
      status: "COMPLETED",
      services: { create: [{ serviceId: shop.services.haircut, serviceName: "Hair cut", price: 150, durationMinutes: 30 }] },
    },
  });
}

const rateVisit = (visitId: string, rating: number, comment?: string) =>
  leaveReview(jsonRequest("/api/customer/reviews", { visitId, rating, comment }));

describe("rating a walk-in", () => {
  it("takes stars and a line about the cut they actually had", async () => {
    const visit = await walkIn();
    expect((await rateVisit(visit.id, 5, "Best fade in Cairo")).status).toBe(201);

    const row = await testPrisma().review.findFirst();
    expect(row!.visitId).toBe(visit.id);
    expect(row!.appointmentId).toBeNull();
    expect(row!.rating).toBe(5);
    expect(row!.barberId).toBe(shop.barbers.abdullah);
  });

  it("carries the barber over, so it lands on their rating", async () => {
    const visit = await walkIn({ barberId: shop.barbers.khaled });
    await rateVisit(visit.id, 4);
    expect((await testPrisma().review.findFirst())!.barberId).toBe(shop.barbers.khaled);
  });

  it("still takes one with nobody's name on it", async () => {
    const visit = await walkIn({ barberId: null });
    expect((await rateVisit(visit.id, 3)).status).toBe(201);
    expect((await testPrisma().review.findFirst())!.barberId).toBeNull();
  });

  it("is a change of mind the second time, not a second review", async () => {
    const visit = await walkIn();
    await rateVisit(visit.id, 2, "Rushed");
    await rateVisit(visit.id, 5, "Came back, much better");

    expect(await testPrisma().review.count()).toBe(1);
    const row = await testPrisma().review.findFirst();
    expect(row!.rating).toBe(5);
    expect(row!.comment).toBe("Came back, much better");
  });

  it("brings a hidden review back out when they rewrite it", async () => {
    const visit = await walkIn();
    await rateVisit(visit.id, 1, "Something abusive");
    await testPrisma().review.updateMany({ where: { visitId: visit.id }, data: { hiddenAt: new Date() } });

    await rateVisit(visit.id, 4, "Fair enough on reflection");
    expect((await testPrisma().review.findFirst())!.hiddenAt).toBeNull();
  });

  it("refuses somebody else's visit, and says only 'not found'", async () => {
    const other = await testPrisma().customer.create({ data: { name: "Mahmoud", phone: "01088887777" } });
    const theirs = await walkIn({ customerId: other.id });

    const res = await rateVisit(theirs.id, 1);
    expect(res.status).toBe(404);
    expect(await testPrisma().review.count()).toBe(0);
  });

  it("refuses a visit that does not exist, the same way", async () => {
    expect((await rateVisit("no-such-visit", 5)).status).toBe(404);
  });

  it("closes the window a month on, like a booked cut", async () => {
    const old = await walkIn({ hoursAgo: (REVIEW_WINDOW_DAYS + 1) * 24 });
    expect((await rateVisit(old.id, 5)).status).toBe(409);
    expect(await testPrisma().review.count()).toBe(0);
  });

  it("refuses one rung up in the future, which should not happen but must not pass", async () => {
    const ahead = await walkIn({ hoursAgo: -2 });
    expect((await rateVisit(ahead.id, 5)).status).toBe(409);
  });

  it("wants exactly one cut named, not none and not both", async () => {
    const visit = await walkIn();
    const appointment = await booked();

    expect((await leaveReview(jsonRequest("/api/customer/reviews", { rating: 5 }))).status).toBe(400);
    expect(
      (await leaveReview(jsonRequest("/api/customer/reviews", { visitId: visit.id, appointmentId: appointment.id, rating: 5 })))
        .status
    ).toBe(400);
    expect(await testPrisma().review.count()).toBe(0);
  });

  it("holds the same star range", async () => {
    const visit = await walkIn();
    expect((await rateVisit(visit.id, 0)).status).toBe(400);
    expect((await rateVisit(visit.id, 6)).status).toBe(400);
  });

  it("turns away anyone not signed in", async () => {
    const visit = await walkIn();
    session = null;
    expect((await rateVisit(visit.id, 5)).status).toBe(401);
  });
});

describe("what the app offers them to rate", () => {
  it("lists a walk-in alongside a booked cut, newest first", async () => {
    await booked(10);
    await walkIn({ hoursAgo: 2 });

    const cuts = await (await listMine()).json();
    expect(cuts).toHaveLength(2);
    expect(cuts[0].visitId).not.toBeNull();
    expect(cuts[0].appointmentId).toBeNull();
    expect(cuts[1].appointmentId).not.toBeNull();
  });

  it("names the services on a walk-in, so they know which cut it means", async () => {
    await walkIn();
    const [cut] = await (await listMine()).json();
    expect(cut.services).toEqual(["Hair cut"]);
    expect(cut.canReview).toBe(true);
  });

  it("does not offer the same cut twice when a booking was rung up", async () => {
    const appointment = await booked();
    const visit = await walkIn();
    await testPrisma().appointment.update({ where: { id: appointment.id }, data: { visitId: visit.id } });

    const cuts = await (await listMine()).json();
    expect(cuts).toHaveLength(1);
    expect(cuts[0].appointmentId).toBe(appointment.id);
  });

  it("keeps showing one they already rated, with what they said", async () => {
    const visit = await walkIn();
    await rateVisit(visit.id, 4, "Good");

    const [cut] = await (await listMine()).json();
    expect(cut.review.rating).toBe(4);
    expect(cut.review.comment).toBe("Good");
  });

  it("still shows them a review the shop has hidden, as their own words", async () => {
    const visit = await walkIn();
    await rateVisit(visit.id, 1, "Harsh");
    await testPrisma().review.updateMany({ where: { visitId: visit.id }, data: { hiddenAt: new Date() } });

    const [cut] = await (await listMine()).json();
    expect(cut.review.rating).toBe(1);
  });

  it("leaves out an old walk-in nobody rated", async () => {
    await walkIn({ hoursAgo: (REVIEW_WINDOW_DAYS + 2) * 24 });
    expect(await (await listMine()).json()).toHaveLength(0);
  });

  it("shows nobody else's cuts", async () => {
    const other = await testPrisma().customer.create({ data: { name: "Mahmoud", phone: "01088887777" } });
    await walkIn({ customerId: other.id });

    expect(await (await listMine()).json()).toHaveLength(0);
  });
});
