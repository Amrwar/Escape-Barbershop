import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { at, dayAhead, getRequest, jsonRequest, seedShop, staffSession, type Shop } from "./fixtures";
import { POST as createAppointment } from "@/app/api/appointments/route";
import { PATCH as updateAppointment } from "@/app/api/appointments/[id]/route";
import { GET as getSlots } from "@/app/api/booking/slots/route";
import { POST as createVisit } from "@/app/api/visits/route";
import { GET as getDrawer, POST as openDrawer } from "@/app/api/cash-drawer/route";
import { GET as getDayReport } from "@/app/api/cash-drawer/day-report/route";

/**
 * Ringing a booking up: the appointment becomes the visit. This is the join
 * between the diary and the money, so it is checked from both sides — the
 * appointment afterwards, and the drawer afterwards.
 */

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
  await openDrawer(jsonRequest("/api/cash-drawer", { openingCash: 1000 }));
});

/** A booked haircut and beard: 50 minutes, 230. */
async function bookOne(minutes = 12 * 60) {
  const res = await createAppointment(
    jsonRequest("/api/appointments", {
      customerId: shop.customer.id,
      barberId: shop.barbers.abdullah,
      startAt: at(day, minutes).toISOString(),
      serviceIds: [shop.services.haircut, shop.services.beard],
      source: "PHONE",
    })
  );
  return res.json();
}

/** What the till sends when the cashier takes the money. */
const ringUp = (appointmentId: string, extra: Record<string, unknown> = {}) =>
  createVisit(
    jsonRequest("/api/visits", {
      customerId: shop.customer.id,
      barberId: shop.barbers.abdullah,
      appointmentId,
      items: [
        { serviceId: shop.services.haircut, quantity: 1, priceAtTime: 150 },
        { serviceId: shop.services.beard, quantity: 1, priceAtTime: 80 },
      ],
      paymentMethod: "CASH",
      ...extra,
    })
  );

const drawer = async () => (await (await getDrawer()).json()).visitSummary;

describe("ringing up a booked appointment", () => {
  it("turns it into one visit, and marks it done", async () => {
    const appointment = await bookOne();
    const res = await ringUp(appointment.id);
    expect(res.status).toBe(201);

    const visit = await res.json();
    expect(visit.total).toBe(230);

    const after = await testPrisma().appointment.findUnique({ where: { id: appointment.id } });
    expect(after?.status).toBe("COMPLETED");
    expect(after?.visitId).toBe(visit.id);
    expect(await testPrisma().visit.count()).toBe(1);
  });

  it("puts the money through the drawer exactly once", async () => {
    const appointment = await bookOne();
    await ringUp(appointment.id);

    const summary = await drawer();
    expect(summary.cashSales).toBe(230);
    expect(summary.expectedCash).toBe(1230);
    expect(summary.visitCount).toBe(1);
  });

  it("refuses to ring the same appointment up twice", async () => {
    const appointment = await bookOne();
    await ringUp(appointment.id);

    const again = await ringUp(appointment.id);
    expect(again.status).toBe(409);
    expect((await again.json()).error).toMatch(/already been rung up/i);
    expect(await testPrisma().visit.count()).toBe(1);
    expect((await drawer()).cashSales).toBe(230);
  });

  it("refuses to ring up a cancelled appointment", async () => {
    const appointment = await bookOne();
    await updateAppointment(jsonRequest(`/api/appointments/${appointment.id}`, { status: "CANCELLED" }, "PATCH"), {
      params: { id: appointment.id },
    });

    const res = await ringUp(appointment.id);
    expect(res.status).toBe(409);
    expect(await testPrisma().visit.count()).toBe(0);
  });

  it("refuses an appointment that no longer exists, and takes no money", async () => {
    const res = await ringUp("no-such-appointment");
    expect(res.status).toBe(404);
    expect(await testPrisma().visit.count()).toBe(0);
    expect((await drawer()).cashSales).toBe(0);
  });

  it("lets the cashier change the price or payment at the till", async () => {
    const appointment = await bookOne();
    const res = await createVisit(
      jsonRequest("/api/visits", {
        customerId: shop.customer.id,
        barberId: shop.barbers.abdullah,
        appointmentId: appointment.id,
        items: [{ serviceId: shop.services.haircut, quantity: 1, priceAtTime: 200 }],
        paymentMethod: "MIXED",
        cashAmount: 100,
        cardAmount: 50,
        instapayAmount: 50,
        tip: 20,
      })
    );
    expect(res.status).toBe(201);

    const summary = await drawer();
    // Part of the payment was cash, so the 20 tip stayed in the drawer with it.
    expect(summary.mixedCash).toBe(120);
    expect(summary.mixedCard).toBe(50);
    expect(summary.mixedInstapay).toBe(50);
    expect(summary.cashOut).toBe(0);
    // The booking quoted 230; what was actually charged is what counts.
    const stored = await testPrisma().appointment.findUnique({ where: { id: appointment.id } });
    expect(stored?.totalPrice).toBe(230);
    expect((await testPrisma().visit.findFirst())?.total).toBe(200);
  });

  it("still frees nothing: a completed appointment keeps its place in the day", async () => {
    const appointment = await bookOne();
    await ringUp(appointment.id);

    const { anyBarber } = await (
      await getSlots(getRequest(`/api/booking/slots?date=${day}&serviceIds=${shop.services.haircut}&barberId=${shop.barbers.abdullah}`))
    ).json();
    expect(anyBarber).not.toContain(at(day, 12 * 60).toISOString());
  });

  it("writes the ring-up into the activity trail", async () => {
    const appointment = await bookOne();
    await ringUp(appointment.id);
    const log = await testPrisma().auditLog.findFirst({ where: { entity: "APPOINTMENT", action: "UPDATE" } });
    expect(log?.summary).toMatch(/Rang up/i);
  });
});

describe("a customer who leaves without paying", () => {
  it("closes the appointment as served but unpaid", async () => {
    const appointment = await bookOne();
    const res = await updateAppointment(
      jsonRequest(`/api/appointments/${appointment.id}`, { status: "COMPLETED_UNPAID" }, "PATCH"),
      { params: { id: appointment.id } }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("COMPLETED_UNPAID");
  });

  it("counts the money nowhere", async () => {
    const appointment = await bookOne();
    await updateAppointment(jsonRequest(`/api/appointments/${appointment.id}`, { status: "COMPLETED_UNPAID" }, "PATCH"), {
      params: { id: appointment.id },
    });

    expect(await testPrisma().visit.count()).toBe(0);
    const summary = await drawer();
    expect(summary.cashSales).toBe(0);
    expect(summary.expectedCash).toBe(1000);

    const today = new Date().toISOString().slice(0, 10);
    const report = await (await getDayReport(getRequest(`/api/cash-drawer/day-report?date=${today}`))).json();
    expect(report.summary.totalRevenue).toBe(0);
  });

  it("keeps the chair as used, so the time is not offered again", async () => {
    const appointment = await bookOne();
    await updateAppointment(jsonRequest(`/api/appointments/${appointment.id}`, { status: "COMPLETED_UNPAID" }, "PATCH"), {
      params: { id: appointment.id },
    });

    const { anyBarber } = await (
      await getSlots(getRequest(`/api/booking/slots?date=${day}&serviceIds=${shop.services.haircut}&barberId=${shop.barbers.abdullah}`))
    ).json();
    expect(anyBarber).not.toContain(at(day, 12 * 60).toISOString());
  });

  it("can still be rung up later if they come back and settle", async () => {
    const appointment = await bookOne();
    await updateAppointment(jsonRequest(`/api/appointments/${appointment.id}`, { status: "COMPLETED_UNPAID" }, "PATCH"), {
      params: { id: appointment.id },
    });

    const res = await ringUp(appointment.id);
    expect(res.status).toBe(201);
    const after = await testPrisma().appointment.findUnique({ where: { id: appointment.id } });
    expect(after?.status).toBe("COMPLETED");
    expect(after?.visitId).toBeTruthy();
  });
});

describe("a visit with no appointment behind it", () => {
  it("still works, exactly as the till always did", async () => {
    const res = await createVisit(
      jsonRequest("/api/visits", {
        customerId: shop.customer.id,
        barberId: shop.barbers.abdullah,
        items: [{ serviceId: shop.services.haircut, quantity: 1, priceAtTime: 150 }],
        paymentMethod: "CASH",
      })
    );
    expect(res.status).toBe(201);
    expect((await drawer()).cashSales).toBe(150);
    expect(await testPrisma().appointment.count()).toBe(0);
  });
});
