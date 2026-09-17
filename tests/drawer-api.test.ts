import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { customerSession, jsonRequest, seedCustomerLogin, seedShop, staffSession, type Shop } from "./fixtures";
import { GET as drawer, POST as openDrawer } from "@/app/api/cash-drawer/route";
import { POST as closeDrawer } from "@/app/api/cash-drawer/close/route";
import { POST as addMovement } from "@/app/api/cash-drawer/movements/route";
import { GET as listSessions } from "@/app/api/cash-drawer/sessions/route";
import { POST as createVisit } from "@/app/api/visits/route";

/**
 * The drawer itself: opening it, moving money in and out by hand, and closing
 * it against what was counted.
 *
 * This is the part of the shop where a mistake is real money, so the tests are
 * about the rules that stop one: a second session cannot be opened over an open
 * one, nothing can be added to a drawer that is shut, and what the screen says
 * is expected must be what the day's takings and movements actually add up to.
 */

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("./db")).testPrisma() }));

let session: unknown = null;
vi.mock("next-auth", () => ({ getServerSession: async () => session }));

let shop: Shop;

beforeAll(() => startTestDatabase());

beforeEach(async () => {
  await resetDatabase();
  shop = await seedShop();
  session = staffSession(shop.cashier.id, "CASHIER");
});

const open = (openingCash: number, notes?: string) =>
  openDrawer(jsonRequest("/api/cash-drawer", { openingCash, notes }));

const move = (type: "IN" | "OUT", amount: number, reason = "Change for the till") =>
  addMovement(jsonRequest("/api/cash-drawer/movements", { type, amount, reason }));

const close = (closingCashCounted: number) =>
  closeDrawer(jsonRequest("/api/cash-drawer/close", { closingCashCounted }));

/** The drawer as the till screen reads it: the session, plus what it should hold. */
const summaryOf = async () => {
  const body = await (await drawer()).json();
  return body ? { ...body, ...body.visitSummary } : null;
};

/** A visit rung up through the till, so it lands in the open session. */
const ringUp = (total: number, paymentMethod: "CASH" | "CARD" | "INSTAPAY" = "CASH") =>
  createVisit(
    jsonRequest("/api/visits", {
      customerId: shop.customer.id,
      barberId: shop.barbers.abdullah,
      visitAt: new Date().toISOString(),
      paymentMethod,
      discount: 0,
      tip: 0,
      items: [{ serviceId: shop.services.haircut, quantity: 1, priceAtTime: total }],
    })
  );

describe("opening the drawer", () => {
  it("starts a session with what was in it", async () => {
    const res = await open(1000, "Morning float");
    expect(res.status).toBe(201);

    const summary = await summaryOf();
    expect(summary.openingCash).toBe(1000);
    expect(summary.expectedCash).toBe(1000);
  });

  it("refuses a second session while one is open", async () => {
    await open(1000);
    const second = await open(500);
    expect(second.status).toBe(409);
    expect(await testPrisma().cashDrawerSession.count()).toBe(1);
  });

  it("writes the opening down in the activity log", async () => {
    await open(1000);
    const entry = await testPrisma().auditLog.findFirstOrThrow({ where: { entity: "DRAWER_SESSION" } });
    expect(entry.summary).toContain("Opened the drawer");
    expect(entry.amount).toBe(1000);
  });

  it("is not a customer's to open", async () => {
    const login = await seedCustomerLogin(shop.customer.id);
    session = customerSession(login.id, login.customerId);
    expect((await open(1000)).status).toBe(401);
  });
});

describe("money moved by hand", () => {
  beforeEach(async () => {
    await open(1000);
  });

  it("adds what was put in and takes out what was taken", async () => {
    expect((await move("IN", 200, "Change from the bank")).status).toBe(201);
    expect((await move("OUT", 150, "Paid the water man")).status).toBe(201);

    const summary = await summaryOf();
    expect(summary.expectedCash).toBe(1050); // 1000 + 200 - 150
    expect(summary.movements).toHaveLength(2);
  });

  it("refuses a movement of nothing, and one with no reason", async () => {
    expect((await move("OUT", 0, "Nothing")).status).toBe(400);
    expect((await move("OUT", 50, "")).status).toBe(400);
  });

  it("has nowhere to put money once the drawer is shut", async () => {
    await close(1000);
    const res = await move("IN", 100, "Too late");
    expect(res.status).toBe(404);
  });

  it("writes each movement down, with its reason", async () => {
    await move("OUT", 75, "Paid the window cleaner");
    const entry = await testPrisma().auditLog.findFirstOrThrow({ where: { entity: "CASH_MOVEMENT" } });
    expect(entry.summary).toContain("window cleaner");
    expect(entry.amount).toBe(75);
  });
});

describe("what the drawer says it should hold", () => {
  beforeEach(async () => {
    await open(1000);
  });

  it("counts cash takings in, and leaves card and InstaPay out of it", async () => {
    await ringUp(300, "CASH");
    await ringUp(500, "CARD");
    await ringUp(200, "INSTAPAY");

    const summary = await summaryOf();
    // Only the cash moved the drawer.
    expect(summary.expectedCash).toBe(1300);
    expect(summary.cashSales).toBe(300);
  });

  it("takes a cash expense back out again", async () => {
    await ringUp(300, "CASH");
    await testPrisma().expense.create({
      data: { date: new Date(), amount: 100, reason: "Cleaning", paymentMethod: "CASH" },
    });

    expect((await summaryOf())?.expectedCash).toBe(1200);
  });

  it("is empty-handed when no session is open", async () => {
    await close(1000);
    expect(await summaryOf()).toBeNull();
  });
});

describe("closing the drawer", () => {
  it("records what was counted, against what was expected", async () => {
    await open(1000);
    await ringUp(300, "CASH");
    await move("OUT", 100, "Paid for tea");

    const res = await close(1150); // 50 short of the 1200 expected
    expect(res.status).toBe(200);

    const closed = await res.json();
    expect(closed.status).toBe("CLOSED");
    expect(closed.closingCashCounted).toBe(1150);
    expect(closed.closedAt).toBeTruthy();
  });

  it("refuses to close a drawer that was never opened", async () => {
    expect((await close(1000)).status).toBe(404);
  });

  it("lets the next session start once it is shut", async () => {
    await open(1000);
    await close(1000);
    expect((await open(800)).status).toBe(201);
    expect(await testPrisma().cashDrawerSession.count()).toBe(2);
  });

  it("writes the closing down, with what the drawer opened on", async () => {
    await open(1000);
    await close(950);

    const entry = await testPrisma().auditLog.findFirstOrThrow({
      where: { entity: "DRAWER_SESSION", action: "UPDATE" },
    });
    expect(entry.summary).toContain("Closed the drawer");
    expect(entry.details).toContain("1000");
  });

  it("is not a customer's to close", async () => {
    await open(1000);
    const login = await seedCustomerLogin(shop.customer.id);
    session = customerSession(login.id, login.customerId);

    expect((await close(1000)).status).toBe(401);
    expect((await testPrisma().cashDrawerSession.findFirstOrThrow()).status).toBe("OPEN");
  });
});

describe("the sessions behind us", () => {
  it("lists them, newest first, for anyone on the staff", async () => {
    await open(1000);
    await close(1000);
    await open(800);

    const sessions = await (await listSessions()).json();
    expect(sessions).toHaveLength(2);
    expect(sessions[0].openingCash).toBe(800);
    expect(sessions[0].status).toBe("OPEN");
  });

  it("is not a customer's to read", async () => {
    const login = await seedCustomerLogin(shop.customer.id);
    session = customerSession(login.id, login.customerId);
    expect((await listSessions()).status).toBe(401);
  });
});
