import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { customerSession, getRequest, jsonRequest, seedCustomerLogin, seedShop, staffSession, type Shop } from "./fixtures";
import { GET as dashboard } from "@/app/api/dashboard/route";
import { GET as discounts } from "@/app/api/discounts/route";
import { GET as auditTrail } from "@/app/api/audit/route";
import { GET as removedVisits } from "@/app/api/audit/removed-visits/route";
import { GET as readAttendance, POST as markAttendance } from "@/app/api/attendance/route";
import { POST as createVisit } from "@/app/api/visits/route";
import { POST as openDrawer } from "@/app/api/cash-drawer/route";
import { POST as addExpense } from "@/app/api/expenses/route";
import { DELETE as removeVisit } from "@/app/api/visits/[id]/route";

/**
 * What the shop reads about itself: the overview, discounts given, absences,
 * and the activity trail.
 *
 * The trail is the one that matters most. It exists so the owner can see what a
 * cashier changed after the fact, which means it has to survive the thing it
 * recorded being deleted — and it must not be readable by the people it is
 * keeping an eye on.
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

/** A visit rung up at the till, optionally with money taken off. */
/** A window wide enough to hold today, which is what these screens take. */
const period = () => {
  const from = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const to = new Date(Date.now() + 2 * 86_400_000).toISOString();
  return `from=${from}&to=${to}`;
};

const ringUp = (total: number, discount = 0) =>
  createVisit(
    jsonRequest("/api/visits", {
      customerId: shop.customer.id,
      barberId: shop.barbers.abdullah,
      visitAt: new Date().toISOString(),
      paymentMethod: "CASH",
      discount,
      tip: 0,
      items: [{ serviceId: shop.services.haircut, quantity: 1, priceAtTime: total }],
    })
  );

describe("the overview", () => {
  it("counts today's takings", async () => {
    await ringUp(300);
    await ringUp(200);

    const today = await (await dashboard(getRequest("/api/dashboard"))).json();
    expect(today.todayRevenue ?? today.todayCash).toBeGreaterThanOrEqual(500);
    expect(today.todayCash).toBe(500);
  });

  it("is open to the staff and closed to a customer", async () => {
    session = staffSession(shop.cashier.id, "CASHIER");
    expect((await dashboard(getRequest("/api/dashboard"))).status).toBe(200);

    const login = await seedCustomerLogin(shop.customer.id);
    session = customerSession(login.id, login.customerId);
    expect((await dashboard(getRequest("/api/dashboard"))).status).toBe(401);
  });
});

describe("money taken off a bill", () => {
  it("lists the visits that were discounted, and what the percentage cost", async () => {
    // The field is a percentage, and the visit total already has it applied —
    // so half off a 300 haircut is 150 given away, not 50.
    await ringUp(300, 50);
    await ringUp(200, 0);

    const body = await (await discounts(getRequest(`/api/discounts?${period()}`))).json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].discountPercent).toBe(50);
    expect(body.rows[0].discountAmount).toBe(150);
    expect(body.summary.discountTotal).toBe(150);
    expect(body.summary.totalVisits).toBe(2);
  });

  it("is the owner's to look at, not the cashier's who gave it", async () => {
    session = staffSession(shop.cashier.id, "CASHIER");
    expect((await discounts(getRequest(`/api/discounts?${period()}`))).status).toBe(401);
  });
});

describe("the activity trail", () => {
  it("records what a cashier changed, with who changed it", async () => {
    session = staffSession(shop.cashier.id, "CASHIER");
    await addExpense(
      jsonRequest("/api/expenses", { date: new Date().toISOString(), amount: 90, reason: "Tea and sugar", paymentMethod: "CASH" })
    );

    session = staffSession(shop.owner.id);
    const body = await (await auditTrail(getRequest("/api/audit"))).json();
    expect(body.rows.length).toBeGreaterThan(0);
    expect(body.rows[0].userRole).toBe("CASHIER");
    expect(body.rows[0].entity).toBe("EXPENSE");
    expect(body.rows[0].summary).toContain("Tea and sugar");
  });

  it("keeps out of the way of an ordinary sale, which is its own record", async () => {
    await ringUp(300);
    // Nothing was changed after the fact, so there is nothing to explain.
    expect(await testPrisma().auditLog.count({ where: { entity: "VISIT" } })).toBe(0);
    expect(await testPrisma().visit.count()).toBe(1);
  });

  it("outlives the visit it was recording", async () => {
    const created = await (await ringUp(300)).json();
    await removeVisit(getRequest(`/api/visits/${created.id}`), { params: { id: created.id } });

    expect(await testPrisma().visit.count()).toBe(0);
    // The record of the deletion is still there, with the money on it.
    const entry = await testPrisma().auditLog.findFirstOrThrow({ where: { entity: "VISIT", action: "DELETE" } });
    expect(entry.amount).toBe(300);
  });

  it("finds a removed visit by the gap it left in the session's numbering", async () => {
    await openDrawer(jsonRequest("/api/cash-drawer", { openingCash: 1000 }));
    const first = await (await ringUp(300)).json();
    await ringUp(200);
    await ringUp(150);

    // Take the middle one out: numbers 1 and 3 remain, 2 is missing.
    await removeVisit(getRequest(`/api/visits/${first.id}`), { params: { id: first.id } });

    const body = await (await removedVisits(getRequest(`/api/audit/removed-visits?${period()}`))).json();
    expect(body.summary.removedVisits).toBeGreaterThan(0);
    expect(body.summary.sessionsAffected).toBe(1);
  });

  it("is not readable by the people it keeps an eye on", async () => {
    session = staffSession(shop.cashier.id, "CASHIER");
    expect((await auditTrail(getRequest("/api/audit"))).status).toBe(401);
    expect((await removedVisits(getRequest("/api/audit/removed-visits"))).status).toBe(401);
  });
});

describe("who was in", () => {
  const day = () => new Date().toISOString().slice(0, 10);

  it("marks a barber absent, and marks them back", async () => {
    const first = await markAttendance(jsonRequest("/api/attendance", { barberId: shop.barbers.abdullah, date: day() }));
    expect((await first.json()).absent).toBe(true);
    expect(await testPrisma().attendance.count()).toBe(1);

    const second = await markAttendance(jsonRequest("/api/attendance", { barberId: shop.barbers.abdullah, date: day() }));
    expect((await second.json()).absent).toBe(false);
    expect(await testPrisma().attendance.count()).toBe(0);
  });

  it("asks who and when", async () => {
    expect((await markAttendance(jsonRequest("/api/attendance", { barberId: shop.barbers.abdullah }))).status).toBe(400);
  });

  it("reads back the absences for a month", async () => {
    await markAttendance(jsonRequest("/api/attendance", { barberId: shop.barbers.abdullah, date: day() }));

    const body = await (await readAttendance(getRequest(`/api/attendance?month=${new Date().getMonth() + 1}&year=${new Date().getFullYear()}`))).json();
    // Keyed by barber, with the days they were out.
    const days = (body.absences ?? body)[shop.barbers.abdullah] ?? [];
    expect(days.length).toBeGreaterThan(0);
  });

  it("is not a customer's business", async () => {
    const login = await seedCustomerLogin(shop.customer.id);
    session = customerSession(login.id, login.customerId);
    expect((await readAttendance(getRequest("/api/attendance?month=1&year=2026"))).status).toBe(401);
  });
});
