import bcrypt from "bcryptjs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { customerSession, getRequest, jsonRequest, seedCustomerLogin, seedShop, staffSession, type Shop } from "./fixtures";
import { GET as listMine, POST as leaveReview } from "@/app/api/customer/reviews/route";
import { GET as listForShop } from "@/app/api/reviews/route";
import { PATCH as moderate } from "@/app/api/reviews/[id]/route";
import { GET as getCatalog } from "@/app/api/customer/catalog/route";
import { GET as barberReviews } from "@/app/api/customer/barbers/[id]/reviews/route";
import { GET as myReviews } from "@/app/api/barber/reviews/route";

/**
 * Reviews: only for a haircut you actually had, one per visit, and the shop can
 * take an abusive one down without it quietly disappearing from its own records.
 */

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("./db")).testPrisma() }));

let session: unknown = null;
vi.mock("next-auth", () => ({ getServerSession: async () => session }));


let shop: Shop;
let login: { id: string; customerId: string };

const barberSession = (userId: string, barberId: string) => ({
  user: { id: userId, email: "", name: "Abdullah", role: "BARBER", barberId },
  loginAt: Date.now(),
  expires: "",
});

beforeAll(() => startTestDatabase());

beforeEach(async () => {
  await resetDatabase();
  shop = await seedShop();
  login = await seedCustomerLogin(shop.customer.id);
  session = customerSession(login.id, login.customerId);
});

/** An appointment that has already happened, in whatever state. */
async function pastAppointment({
  status = "COMPLETED",
  hoursAgo = 3,
  barberId = shop.barbers.abdullah,
  customerId = shop.customer.id,
}: { status?: string; hoursAgo?: number; barberId?: string | null; customerId?: string } = {}) {
  const start = new Date(Date.now() - hoursAgo * 3_600_000);
  return testPrisma().appointment.create({
    data: {
      customerId,
      barberId,
      startAt: start,
      endAt: new Date(start.getTime() + 30 * 60_000),
      durationMinutes: 30,
      totalPrice: 150,
      status: status as never,
      services: { create: [{ serviceId: shop.services.haircut, serviceName: "Hair cut", price: 150, durationMinutes: 30 }] },
    },
  });
}

const review = (appointmentId: string, rating: number, comment?: string) =>
  leaveReview(jsonRequest("/api/customer/reviews", { appointmentId, rating, comment }));

describe("leaving a review", () => {
  it("takes stars and a line about a haircut they have had", async () => {
    const appointment = await pastAppointment();
    const res = await review(appointment.id, 5, "Best fade in Cairo");
    expect(res.status).toBe(201);

    const row = await testPrisma().review.findFirst();
    expect(row?.rating).toBe(5);
    expect(row?.comment).toBe("Best fade in Cairo");
    expect(row?.barberId).toBe(shop.barbers.abdullah);
  });

  it("accepts stars on their own, with nothing written", async () => {
    const appointment = await pastAppointment();
    expect((await review(appointment.id, 4)).status).toBe(201);
    expect((await testPrisma().review.findFirst())?.comment).toBeNull();
  });

  it("lets them review a visit they left without paying", async () => {
    const appointment = await pastAppointment({ status: "COMPLETED_UNPAID" });
    expect((await review(appointment.id, 3)).status).toBe(201);
  });

  it("refuses a haircut that has not happened yet", async () => {
    const start = new Date(Date.now() + 2 * 3_600_000);
    const appointment = await testPrisma().appointment.create({
      data: {
        customerId: shop.customer.id,
        barberId: shop.barbers.abdullah,
        startAt: start,
        endAt: new Date(start.getTime() + 30 * 60_000),
        durationMinutes: 30,
        totalPrice: 150,
        status: "CONFIRMED",
      },
    });
    expect((await review(appointment.id, 5)).status).toBe(409);
    expect(await testPrisma().review.count()).toBe(0);
  });

  it("refuses one that was called off or missed", async () => {
    const cancelled = await pastAppointment({ status: "CANCELLED" });
    const missed = await pastAppointment({ status: "NO_SHOW", hoursAgo: 5 });
    expect((await review(cancelled.id, 1)).status).toBe(409);
    expect((await review(missed.id, 1)).status).toBe(409);
  });

  it("refuses one older than a month", async () => {
    const appointment = await pastAppointment({ hoursAgo: 31 * 24 });
    expect((await review(appointment.id, 5)).status).toBe(409);
  });

  it("refuses somebody else's haircut, and says only 'not found'", async () => {
    const other = await testPrisma().customer.create({ data: { name: "Someone Else" } });
    const appointment = await pastAppointment({ customerId: other.id });
    const res = await review(appointment.id, 1);
    expect(res.status).toBe(404); // not 403: the id's existence is not ours to confirm
    expect(await testPrisma().review.count()).toBe(0);
  });

  it("refuses anyone not signed in", async () => {
    const appointment = await pastAppointment();
    session = null;
    expect((await review(appointment.id, 5)).status).toBe(401);
  });

  it("refuses stars that could not have been meant", async () => {
    const appointment = await pastAppointment();
    expect((await review(appointment.id, 0)).status).toBe(400);
    expect((await review(appointment.id, 6)).status).toBe(400);
    expect(await testPrisma().review.count()).toBe(0);
  });

  it("changes their mind in place, rather than reviewing twice", async () => {
    const appointment = await pastAppointment();
    await review(appointment.id, 2, "Rushed");
    await review(appointment.id, 5, "Came back, much better");

    const rows = await testPrisma().review.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].rating).toBe(5);
    expect(rows[0].comment).toBe("Came back, much better");
  });
});

describe("what the customer sees of their own", () => {
  it("lists what they may review, with their own words attached", async () => {
    const reviewed = await pastAppointment();
    await pastAppointment({ hoursAgo: 6 });
    await review(reviewed.id, 5, "Perfect");

    const list = await (await listMine()).json();
    expect(list).toHaveLength(2);
    expect(list.find((r: { appointmentId: string }) => r.appointmentId === reviewed.id).review.rating).toBe(5);
    expect(list.filter((r: { canReview: boolean }) => r.canReview)).toHaveLength(2);
  });

  it("leaves out a haircut that is too old to review and was never reviewed", async () => {
    await pastAppointment({ hoursAgo: 40 * 24 });
    expect(await (await listMine()).json()).toHaveLength(0);
  });
});

describe("what the app shows about a barber", () => {
  it("averages the stars on their profile, and prints the comments", async () => {
    const first = await pastAppointment();
    const second = await pastAppointment({ hoursAgo: 6 });
    await review(first.id, 5, "Best fade in Cairo");
    await review(second.id, 4);

    const res = await barberReviews(getRequest("/api/customer/barbers/x/reviews"), { params: { id: shop.barbers.abdullah } });
    const body = await res.json();
    expect(body.summary).toEqual({ average: 4.5, count: 2 });
    // Only the one with something written appears; both count towards the average.
    expect(body.reviews).toHaveLength(1);
    expect(body.reviews[0].comment).toBe("Best fade in Cairo");
  });

  it("gives a first name only, never the customer's full name", async () => {
    const appointment = await pastAppointment();
    await review(appointment.id, 5, "Great");
    const body = await (await barberReviews(getRequest("/x"), { params: { id: shop.barbers.abdullah } })).json();
    expect(body.reviews[0].name).toBe("Ahmed");
  });

  it("carries the rating into the list of barbers", async () => {
    const appointment = await pastAppointment();
    await review(appointment.id, 4);

    const catalog = await (await getCatalog()).json();
    const rated = catalog.barbers.find((b: { id: string }) => b.id === shop.barbers.abdullah);
    const unrated = catalog.barbers.find((b: { id: string }) => b.id === shop.barbers.khaled);
    expect(rated.rating).toEqual({ average: 4, count: 1 });
    // Unknown, not nought out of five.
    expect(unrated.rating).toEqual({ average: null, count: 0 });
  });
});

describe("the shop's side", () => {
  it("shows a barber their own reviews and nobody else's", async () => {
    const mine = await pastAppointment();
    const theirs = await pastAppointment({ barberId: shop.barbers.khaled, hoursAgo: 6 });
    await review(mine.id, 5, "Excellent");
    await review(theirs.id, 2, "Not for me");

    const user = await testPrisma().user.create({
      data: {
        name: "Abdullah",
        email: "abdullah@escape.test",
        password: await bcrypt.hash("barber-password", 4),
        role: "BARBER",
        barberId: shop.barbers.abdullah,
      },
    });
    session = barberSession(user.id, shop.barbers.abdullah);

    const body = await (await myReviews()).json();
    expect(body.summary).toEqual({ average: 5, count: 1 });
    expect(body.reviews.map((r: { comment: string }) => r.comment)).toEqual(["Excellent"]);
  });

  it("hides an abusive one from the app, without deleting it", async () => {
    const appointment = await pastAppointment();
    await review(appointment.id, 1, "something abusive");
    const { id } = (await testPrisma().review.findFirstOrThrow())!;

    session = staffSession(shop.owner.id);
    expect((await moderate(jsonRequest(`/api/reviews/${id}`, { hidden: true }, "PATCH"), { params: { id } })).status).toBe(200);

    // Gone from the app, and counting for nothing.
    const body = await (await barberReviews(getRequest("/x"), { params: { id: shop.barbers.abdullah } })).json();
    expect(body.reviews).toHaveLength(0);
    expect(body.summary).toEqual({ average: null, count: 0 });

    // Still in the shop's own list, and still in the audit trail.
    const shopView = await (await listForShop(getRequest("/api/reviews"))).json();
    expect(shopView.reviews).toHaveLength(1);
    expect(shopView.hiddenCount).toBe(1);
    expect(await testPrisma().auditLog.count({ where: { entity: "REVIEW" } })).toBe(1);
  });

  it("puts one back", async () => {
    const appointment = await pastAppointment();
    await review(appointment.id, 3, "Fine");
    const { id } = await testPrisma().review.findFirstOrThrow();

    session = staffSession(shop.owner.id);
    await moderate(jsonRequest(`/api/reviews/${id}`, { hidden: true }, "PATCH"), { params: { id } });
    await moderate(jsonRequest(`/api/reviews/${id}`, { hidden: false }, "PATCH"), { params: { id } });

    const body = await (await barberReviews(getRequest("/x"), { params: { id: shop.barbers.abdullah } })).json();
    expect(body.summary.count).toBe(1);
  });

  it("is not the cashier's decision to hide one", async () => {
    const appointment = await pastAppointment();
    await review(appointment.id, 1, "harsh");
    const { id } = await testPrisma().review.findFirstOrThrow();

    session = staffSession(shop.cashier.id, "CASHIER");
    expect((await moderate(jsonRequest(`/api/reviews/${id}`, { hidden: true }, "PATCH"), { params: { id } })).status).toBe(401);
    expect((await testPrisma().review.findFirstOrThrow()).hiddenAt).toBeNull();
  });

  it("brings a rewritten review back out of hiding", async () => {
    const appointment = await pastAppointment();
    await review(appointment.id, 1, "harsh words");
    const { id } = await testPrisma().review.findFirstOrThrow();

    session = staffSession(shop.owner.id);
    await moderate(jsonRequest(`/api/reviews/${id}`, { hidden: true }, "PATCH"), { params: { id } });

    // New words the shop has not judged, so they stand until it judges them.
    session = customerSession(login.id, login.customerId);
    await review(appointment.id, 3, "calmer second thoughts");
    expect((await testPrisma().review.findFirstOrThrow()).hiddenAt).toBeNull();
  });

  it("keeps the shop's list away from customers", async () => {
    session = customerSession(login.id, login.customerId);
    expect((await listForShop(getRequest("/api/reviews"))).status).toBe(401);
  });
});
