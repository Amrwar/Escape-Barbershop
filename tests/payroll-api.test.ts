import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { customerSession, getRequest, jsonRequest, seedCustomerLogin, seedShop, staffSession, type Shop } from "./fixtures";
import { GET as listPenalties, POST as addPenalty } from "@/app/api/penalties/route";
import { DELETE as removePenalty } from "@/app/api/penalties/[id]/route";
import { GET as salaries } from "@/app/api/salaries/route";
import { GET as barberStats } from "@/app/api/barber-stats/route";
import { DELETE as removeAdvance } from "@/app/api/advances/[id]/route";
import { DELETE as removeExpense } from "@/app/api/expenses/[id]/route";
import { POST as addAdvance } from "@/app/api/advances/route";
import { POST as addExpense } from "@/app/api/expenses/route";

/**
 * Payroll and money going out: penalties, advances, expenses, and the salary
 * sheet they all land on.
 *
 * Two things matter here. The figures must be the ones the barber is actually
 * paid, and the screens that can reduce somebody's pay must belong to the owner
 * alone — a cashier may take an expense, but must not fine a barber.
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

const today = () => new Date().toISOString();
const thisMonth = () => ({ month: new Date().getMonth() + 1, year: new Date().getFullYear() });

const penalise = (amount: number, reason = "Late twice") =>
  addPenalty(jsonRequest("/api/penalties", { barberId: shop.barbers.abdullah, date: today(), amount, reason }));

const advance = (amount: number, paymentMethod: "CASH" | "CARD" | "INSTAPAY" = "CASH") =>
  addAdvance(jsonRequest("/api/advances", { barberId: shop.barbers.abdullah, date: today(), amount, paymentMethod }));

const expense = (amount: number, reason = "Cleaning") =>
  addExpense(jsonRequest("/api/expenses", { date: today(), amount, reason, paymentMethod: "CASH" }));

/** A visit for Abdullah, which is what a commission is worked out from. */
const served = (total: number) =>
  testPrisma().visit.create({
    data: {
      customerId: shop.customer.id,
      barberId: shop.barbers.abdullah,
      total,
      paymentMethod: "CASH",
      cashAmount: total,
      items: { create: [{ serviceId: shop.services.haircut, quantity: 1, priceAtTime: total }] },
    },
  });

describe("fining a barber", () => {
  it("records it against them, with the reason", async () => {
    const res = await penalise(100, "Left the chair unswept");
    expect(res.status).toBe(201);

    const penalty = await testPrisma().penalty.findFirstOrThrow();
    expect(penalty.barberId).toBe(shop.barbers.abdullah);
    expect(penalty.amount).toBe(100);
    expect(penalty.reason).toBe("Left the chair unswept");
  });

  it("is written down in the activity log", async () => {
    await penalise(100);
    const entry = await testPrisma().auditLog.findFirstOrThrow({ where: { entity: "PENALTY" } });
    expect(entry.summary).toContain("Abdullah");
  });

  it("is the owner's alone — a cashier cannot reduce somebody's pay", async () => {
    session = staffSession(shop.cashier.id, "CASHIER");
    expect((await penalise(100)).status).toBe(401);
    expect((await listPenalties(getRequest("/api/penalties"))).status).toBe(401);
    expect(await testPrisma().penalty.count()).toBe(0);
  });

  it("can be taken back, and leaves the trail behind", async () => {
    await penalise(100);
    const { id } = await testPrisma().penalty.findFirstOrThrow();

    expect((await removePenalty(getRequest(`/api/penalties/${id}`), { params: { id } })).status).toBe(200);
    expect(await testPrisma().penalty.count()).toBe(0);
    expect(await testPrisma().auditLog.count({ where: { entity: "PENALTY" } })).toBe(2);
  });
});

describe("the salary sheet", () => {
  it("adds up what a barber earned, and takes off what they owe", async () => {
    await testPrisma().barberSalarySettings.create({
      data: { barberId: shop.barbers.abdullah, baseSalary: 3000, commissionType: "PERCENT", commissionValue: 10 },
    });
    await served(1000);
    await penalise(100);
    await advance(200);

    const { month, year } = thisMonth();
    const sheet = await (await salaries(getRequest(`/api/salaries?month=${month}&year=${year}`))).json();
    const abdullah = sheet.find((row: { barberId: string }) => row.barberId === shop.barbers.abdullah);

    expect(abdullah.baseSalary).toBe(3000);
    expect(abdullah.commission).toBe(100); // 10% of 1000
    expect(abdullah.penaltiesTotal).toBe(100);
    expect(abdullah.advancesTotal).toBe(200);
    expect(abdullah.net).toBe(2800); // 3000 + 100 - 100 - 200
  });

  it("asks for a month before it will answer", async () => {
    expect((await salaries(getRequest("/api/salaries"))).status).toBe(400);
  });

  it("is not the cashier's to read", async () => {
    session = staffSession(shop.cashier.id, "CASHIER");
    const { month, year } = thisMonth();
    expect((await salaries(getRequest(`/api/salaries?month=${month}&year=${year}`))).status).toBe(401);
  });
});

describe("a barber's own figures", () => {
  it("counts their visits and takings over a period", async () => {
    await served(300);
    await served(200);

    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 86_400_000).toISOString();
    const stats = await (
      await barberStats(getRequest(`/api/barber-stats?barberId=${shop.barbers.abdullah}&from=${from}&to=${to}`))
    ).json();

    expect(stats.visits).toHaveLength(2);
    expect(stats.summary.visitCount).toBe(2);
    expect(stats.summary.totalRevenue).toBe(500);
    expect(stats.summary.cashTotal).toBe(500);
  });

  it("asks for a barber and a period", async () => {
    expect((await barberStats(getRequest("/api/barber-stats"))).status).toBe(400);
  });

  it("is not a customer's to read", async () => {
    const login = await seedCustomerLogin(shop.customer.id);
    session = customerSession(login.id, login.customerId);
    expect((await barberStats(getRequest("/api/barber-stats?barberId=x&from=2026-01-01&to=2026-12-31"))).status).toBe(401);
  });
});

describe("taking money back out", () => {
  it("lets the owner remove an advance that should not have been given", async () => {
    await advance(500);
    const { id } = await testPrisma().advance.findFirstOrThrow();

    expect((await removeAdvance(getRequest(`/api/advances/${id}`), { params: { id } })).status).toBe(200);
    expect(await testPrisma().advance.count()).toBe(0);
  });

  it("does not let a cashier remove one", async () => {
    await advance(500);
    const { id } = await testPrisma().advance.findFirstOrThrow();

    session = staffSession(shop.cashier.id, "CASHIER");
    expect((await removeAdvance(getRequest(`/api/advances/${id}`), { params: { id } })).status).toBe(401);
    expect(await testPrisma().advance.count()).toBe(1);
  });

  it("lets the staff remove an expense, and remembers what it was", async () => {
    await expense(120, "Bought tea");
    const { id } = await testPrisma().expense.findFirstOrThrow();

    expect((await removeExpense(getRequest(`/api/expenses/${id}`), { params: { id } })).status).toBe(200);
    expect(await testPrisma().expense.count()).toBe(0);

    const entry = await testPrisma().auditLog.findFirstOrThrow({ where: { entity: "EXPENSE", action: "DELETE" } });
    expect(entry.summary).toContain("Bought tea");
  });

  it("refuses to remove something that is not there", async () => {
    expect((await removeExpense(getRequest("/api/expenses/nope"), { params: { id: "nope" } })).status).toBe(404);
  });
});
