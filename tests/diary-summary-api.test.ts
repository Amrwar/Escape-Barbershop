import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { at, customerSession, dayAhead, getRequest, jsonRequest, seedShop, staffSession, type Shop } from "./fixtures";
import { GET as getSummary } from "@/app/api/appointments/summary/route";
import { POST as createAppointment } from "@/app/api/appointments/route";
import { PATCH as updateAppointment } from "@/app/api/appointments/[id]/route";
import { POST as addWalkIn } from "@/app/api/queue/route";
import { POST as createVisit } from "@/app/api/visits/route";
import { POST as openDrawer } from "@/app/api/cash-drawer/route";

/** The day's diary in numbers, as the owner reads it. */

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("./db")).testPrisma() }));

let session: unknown = null;
vi.mock("next-auth", () => ({ getServerSession: async () => session }));

let shop: Shop;
let day: string;

beforeAll(() => startTestDatabase());

beforeEach(async () => {
  await resetDatabase();
  shop = await seedShop();
  session = staffSession(shop.owner.id);
  day = dayAhead(1);
  await openDrawer(jsonRequest("/api/cash-drawer", { openingCash: 0 }));
});

const book = async (minutes: number, extra: Record<string, unknown> = {}) => {
  const res = await createAppointment(
    jsonRequest("/api/appointments", {
      customerId: shop.customer.id,
      barberId: shop.barbers.abdullah,
      startAt: at(day, minutes).toISOString(),
      serviceIds: [shop.services.haircut],
      source: "PHONE",
      ...extra,
    })
  );
  return res.json();
};

const summaryFor = async (date = day) => (await getSummary(getRequest(`/api/appointments/summary?date=${date}`))).json();

describe("the day's diary in numbers", () => {
  it("is empty before anything is booked", async () => {
    const { summary } = await summaryFor();
    expect(summary.total).toBe(0);
    expect(summary.expectedTakings).toBe(0);
  });

  it("counts what is still to come, and what it should bring in", async () => {
    await book(12 * 60);
    await book(13 * 60);

    const { summary } = await summaryFor();
    expect(summary.total).toBe(2);
    expect(summary.open).toBe(2);
    expect(summary.booked).toBe(2);
    expect(summary.expectedTakings).toBe(300); // two haircuts at 150
  });

  it("moves an appointment from expected to served once it is rung up", async () => {
    const appointment = await book(12 * 60);
    await createVisit(
      jsonRequest("/api/visits", {
        customerId: shop.customer.id,
        barberId: shop.barbers.abdullah,
        appointmentId: appointment.id,
        items: [{ serviceId: shop.services.haircut, quantity: 1, priceAtTime: 150 }],
        paymentMethod: "CASH",
      })
    );

    const { summary } = await summaryFor();
    expect(summary.completed).toBe(1);
    expect(summary.open).toBe(0);
    expect(summary.servedTakings).toBe(150);
    expect(summary.expectedTakings).toBe(0);
  });

  it("counts the people who did not turn up, and what that cost", async () => {
    const missed = await book(12 * 60);
    await book(13 * 60);
    await updateAppointment(jsonRequest(`/api/appointments/${missed.id}`, { status: "NO_SHOW" }, "PATCH"), {
      params: { id: missed.id },
    });

    const { summary, noShowRate } = await summaryFor();
    expect(summary.noShows).toBe(1);
    expect(summary.missedTakings).toBe(150);
    expect(noShowRate).toBe(100); // the only one judged so far
  });

  it("shows the ones served but never paid for, separately", async () => {
    const unpaid = await book(12 * 60);
    await updateAppointment(jsonRequest(`/api/appointments/${unpaid.id}`, { status: "COMPLETED_UNPAID" }, "PATCH"), {
      params: { id: unpaid.id },
    });

    const { summary } = await summaryFor();
    expect(summary.unpaid).toBe(1);
    expect(summary.unpaidTakings).toBe(150);
    expect(summary.completed).toBe(0);
    expect(summary.servedTakings).toBe(0);
  });

  it("keeps a cancelled appointment out of the day's work", async () => {
    const cancelled = await book(12 * 60);
    await updateAppointment(jsonRequest(`/api/appointments/${cancelled.id}`, { status: "CANCELLED" }, "PATCH"), {
      params: { id: cancelled.id },
    });

    const { summary } = await summaryFor();
    expect(summary.total).toBe(0);
    expect(summary.cancelled).toBe(1);
    expect(summary.expectedTakings).toBe(0);
  });

  it("counts walk-ins apart from bookings", async () => {
    await book(12 * 60);
    await addWalkIn(jsonRequest("/api/queue", { customerId: shop.customer.id, serviceIds: [shop.services.beard] }));

    // A walk-in lands on the shop's today, which is not always the UTC one.
    const [{ summary: booked }, { summary: walked }] = await Promise.all([summaryFor(), summaryFor(dayAhead(0))]);
    expect(booked.booked).toBe(1);
    expect(booked.walkIns).toBe(0);
    expect(walked.walkIns).toBe(1);
    expect(walked.waiting).toBe(1);
  });

  it("counts the ones that came from the app", async () => {
    await book(12 * 60, { source: "ONLINE" });
    await book(13 * 60, { source: "PHONE" });
    const { summary } = await summaryFor();
    expect(summary.online).toBe(1);
    expect(summary.booked).toBe(2);
  });

  it("belongs to one day only", async () => {
    await book(12 * 60);
    const { summary } = await summaryFor(dayAhead(5));
    expect(summary.total).toBe(0);
  });

  it("refuses a date that is not a date", async () => {
    const res = await getSummary(getRequest("/api/appointments/summary?date=soon"));
    expect(res.status).toBe(400);
  });
});

describe("who may read it", () => {
  it("is staff only", async () => {
    session = customerSession("user-1", shop.customer.id);
    expect((await getSummary(getRequest("/api/appointments/summary"))).status).toBe(401);
    session = null;
    expect((await getSummary(getRequest("/api/appointments/summary"))).status).toBe(401);
  });

  it("is open to a cashier, who runs the floor", async () => {
    session = staffSession(shop.cashier.id, "CASHIER");
    expect((await getSummary(getRequest("/api/appointments/summary"))).status).toBe(200);
  });
});

describe("the diary and the till agree", () => {
  it("counts the same served money the visit recorded", async () => {
    const appointment = await book(12 * 60);
    await createVisit(
      jsonRequest("/api/visits", {
        customerId: shop.customer.id,
        barberId: shop.barbers.abdullah,
        appointmentId: appointment.id,
        items: [{ serviceId: shop.services.haircut, quantity: 1, priceAtTime: 150 }],
        paymentMethod: "CASH",
      })
    );

    const { summary } = await summaryFor();
    const visits = await testPrisma().visit.aggregate({ _sum: { total: true } });
    expect(summary.servedTakings).toBe(visits._sum.total);
  });
});
