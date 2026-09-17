import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { getRequest, jsonRequest, seedShop, staffSession, type Shop } from "./fixtures";
import { POST as createVisit } from "@/app/api/visits/route";
import { DELETE as removeVisit } from "@/app/api/visits/[id]/route";
import { GET as getDrawer, POST as openDrawer } from "@/app/api/cash-drawer/route";
import { GET as getDayReport } from "@/app/api/cash-drawer/day-report/route";
import { GET as getReports } from "@/app/api/reports/route";
import { POST as addExpense } from "@/app/api/expenses/route";
import { POST as addAdvance } from "@/app/api/advances/route";
import { PATCH as saveFinance } from "@/app/api/settings/finance/route";
import { shopDateISO } from "@/lib/booking";

/**
 * The money, end to end: a visit rung up at the till, through the drawer, the
 * day journal and the period report. These figures are what the shop reconciles
 * every night, so they are checked against real rows rather than mocks.
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
  await openDrawer(jsonRequest("/api/cash-drawer", { openingCash: 1000 }));
  await saveFinance(jsonRequest("/api/settings/finance", { visaCommissionPercent: 2.5 }, "PATCH"));
});

/** One haircut, paid however the test says. */
const ringUp = (payment: Record<string, unknown>) =>
  createVisit(
    jsonRequest("/api/visits", {
      customerId: shop.customer.id,
      barberId: shop.barbers.abdullah,
      items: [{ serviceId: shop.services.haircut, quantity: 1, priceAtTime: 200 }],
      ...payment,
    })
  );

const drawer = async () => (await (await getDrawer()).json()).visitSummary;
// The shop's own date, not the server's: the day report is asked for the day the
// shop is having, and on a machine in another country those differ for hours.
const today = () => shopDateISO(Date.now());

describe("taking money at the till", () => {
  it("puts cash in the drawer and leaves the other accounts alone", async () => {
    await ringUp({ paymentMethod: "CASH" });
    const summary = await drawer();
    expect(summary.cashSales).toBe(200);
    expect(summary.cardSales).toBe(0);
    expect(summary.instapaySales).toBe(0);
    expect(summary.expectedCash).toBe(1200); // 1000 opening + 200
  });

  it("keeps a card sale out of the drawer, less the machine's commission", async () => {
    await ringUp({ paymentMethod: "CARD" });
    const summary = await drawer();
    expect(summary.cardSales).toBe(200);
    expect(summary.visaCommission).toBe(5); // 2.5%
    expect(summary.cardNet).toBe(195);
    expect(summary.expectedCash).toBe(1000); // untouched
  });

  it("keeps an InstaPay transfer out of the drawer, with no commission", async () => {
    await ringUp({ paymentMethod: "INSTAPAY" });
    const summary = await drawer();
    expect(summary.instapaySales).toBe(200);
    expect(summary.instapayNet).toBe(200);
    expect(summary.visaCommission).toBe(0);
    expect(summary.expectedCash).toBe(1000);
  });

  it("splits a mixed payment across the three accounts", async () => {
    await ringUp({ paymentMethod: "MIXED", cashAmount: 50, cardAmount: 70, instapayAmount: 80 });
    const summary = await drawer();
    expect(summary.mixedCash).toBe(50);
    expect(summary.mixedCard).toBe(70);
    expect(summary.mixedInstapay).toBe(80);
    expect(summary.expectedCash).toBe(1050);
  });

  it("refuses a mixed payment that does not add up", async () => {
    const res = await ringUp({ paymentMethod: "MIXED", cashAmount: 50, cardAmount: 70 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/add up/i);
    expect(await testPrisma().visit.count()).toBe(0);
  });

  it("adds a cash tip to the drawer and leaves no payout behind", async () => {
    await ringUp({ paymentMethod: "CASH", tip: 30 });
    const summary = await drawer();
    expect(summary.cashSales).toBe(230); // 200 + the tip in the till
    expect(summary.cashOut).toBe(0);
  });

  it("pays a card tip to the barber out of the drawer", async () => {
    await ringUp({ paymentMethod: "CARD", tip: 30 });
    const summary = await drawer();
    expect(summary.cashOut).toBe(30);
    expect(summary.expectedCash).toBe(970);
    const movement = await testPrisma().cashMovement.findFirst();
    expect(movement?.reason).toMatch(/^Card tip/);
  });

  it("pays an InstaPay tip out of the drawer too", async () => {
    await ringUp({ paymentMethod: "INSTAPAY", tip: 20 });
    const movement = await testPrisma().cashMovement.findFirst();
    expect(movement?.reason).toMatch(/^InstaPay tip/);
    expect((await drawer()).expectedCash).toBe(980);
  });
});

describe("money going out", () => {
  it("takes a cash expense out of the drawer", async () => {
    await addExpense(jsonRequest("/api/expenses", { date: new Date().toISOString(), amount: 120, reason: "Cleaning", paymentMethod: "CASH" }));
    expect((await drawer()).expectedCash).toBe(880);
  });

  it("takes a card expense off the card account, not the drawer", async () => {
    await ringUp({ paymentMethod: "CARD" });
    await addExpense(jsonRequest("/api/expenses", { date: new Date().toISOString(), amount: 100, reason: "Supplies", paymentMethod: "CARD" }));
    const summary = await drawer();
    expect(summary.expectedCash).toBe(1000);
    expect(summary.cardNet).toBe(95); // 200 - 5 commission - 100
  });

  it("takes an InstaPay expense off the InstaPay account only", async () => {
    await ringUp({ paymentMethod: "INSTAPAY" });
    await addExpense(jsonRequest("/api/expenses", { date: new Date().toISOString(), amount: 60, reason: "Delivery", paymentMethod: "INSTAPAY" }));
    const summary = await drawer();
    expect(summary.expectedCash).toBe(1000);
    expect(summary.instapayNet).toBe(140);
  });

  it("takes an advance out of the account that paid it, without touching revenue", async () => {
    await ringUp({ paymentMethod: "CASH" });
    await addAdvance(
      jsonRequest("/api/advances", { barberId: shop.barbers.abdullah, date: new Date().toISOString(), amount: 300, paymentMethod: "CASH" })
    );

    const summary = await drawer();
    expect(summary.expectedCash).toBe(900); // 1000 + 200 - 300
    expect(summary.cashAdvances).toBe(300);

    const report = await (await getDayReport(getRequest(`/api/cash-drawer/day-report?date=${today()}`))).json();
    expect(report.summary.advancesTotal).toBe(300);
    expect(report.summary.expensesTotal).toBe(0); // an advance is payroll, not a cost
    expect(report.summary.netRevenue).toBe(200);
  });
});

describe("the day journal and the period report agree", () => {
  it("adds the three accounts up to the day's revenue", async () => {
    await ringUp({ paymentMethod: "CASH" });
    await ringUp({ paymentMethod: "CARD" });
    await ringUp({ paymentMethod: "INSTAPAY" });
    await ringUp({ paymentMethod: "MIXED", cashAmount: 100, cardAmount: 50, instapayAmount: 50 });

    const { summary } = await (await getDayReport(getRequest(`/api/cash-drawer/day-report?date=${today()}`))).json();
    expect(summary.cashSales).toBe(300);
    expect(summary.cardSales).toBe(250);
    expect(summary.instapaySales).toBe(250);
    expect(summary.totalRevenue).toBe(800);
  });

  it("reports the same takings over a period as the day did", async () => {
    await ringUp({ paymentMethod: "CASH" });
    await ringUp({ paymentMethod: "CARD" });
    await ringUp({ paymentMethod: "INSTAPAY" });

    const from = new Date(Date.now() - 24 * 3600_000).toISOString();
    const to = new Date(Date.now() + 24 * 3600_000).toISOString();
    const { summary } = await (await getReports(getRequest(`/api/reports?from=${from}&to=${to}`))).json();

    expect(summary.totalRevenue).toBe(600);
    expect(summary.cashTotal + summary.cardTotal + summary.instapayTotal).toBe(600);
    expect(summary.visaCommission).toBe(5);
    expect(summary.netRevenue).toBe(595); // less the commission, no expenses
  });

  it("counts a removed visit nowhere, and keeps a record of it", async () => {
    const res = await ringUp({ paymentMethod: "CASH" });
    const visit = await res.json();
    await removeVisit(getRequest(`/api/visits/${visit.id}`), { params: { id: visit.id } });

    expect((await drawer()).cashSales).toBe(0);
    const log = await testPrisma().auditLog.findFirst({ where: { entity: "VISIT", action: "DELETE" } });
    expect(log).toBeTruthy();
  });
});

describe("who may take money", () => {
  it("turns away a customer login at the till", async () => {
    session = { user: { id: "c1", role: "CUSTOMER", customerId: shop.customer.id, name: "Ahmed", email: "" }, loginAt: Date.now(), expires: "" };
    expect((await ringUp({ paymentMethod: "CASH" })).status).toBe(401);
    expect((await getDrawer()).status).toBe(401);
    expect((await addExpense(jsonRequest("/api/expenses", { date: new Date().toISOString(), amount: 10, reason: "x", paymentMethod: "CASH" }))).status).toBe(401);
  });

  it("keeps the period report for the owner alone", async () => {
    session = staffSession(shop.cashier.id, "CASHIER");
    const from = new Date(Date.now() - 3600_000).toISOString();
    const to = new Date().toISOString();
    expect((await getReports(getRequest(`/api/reports?from=${from}&to=${to}`))).status).toBe(401);
  });
});
