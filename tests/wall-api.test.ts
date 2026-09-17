import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { at, customerSession, dayAhead, seedCustomerLogin, seedShop, staffSession, type Shop } from "./fixtures";
import { GET as wall } from "@/app/api/wall/route";

/**
 * The screen on the wall.
 *
 * It faces the room, so the test that matters most is about what it does *not*
 * say: no surnames, no phone numbers, nothing about money against a person.
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

/** Somebody in the shop today, at whatever stage. */
async function inShop(name: string, phone: string, status: "CHECKED_IN" | "IN_PROGRESS", minutes: number) {
  const customer = await testPrisma().customer.create({ data: { name, phone } });
  return testPrisma().appointment.create({
    data: {
      customerId: customer.id,
      barberId: shop.barbers.abdullah,
      startAt: at(dayAhead(0), minutes),
      endAt: at(dayAhead(0), minutes + 30),
      durationMinutes: 30,
      totalPrice: 300,
      status,
      services: { create: [{ serviceId: shop.services.haircut, serviceName: "Hair cut", price: 300, durationMinutes: 30 }] },
    },
  });
}

const board = async () => (await wall()).json();

describe("what the room can read", () => {
  it("shows who is in the chair and who is waiting", async () => {
    await inShop("Ahmed Mohamed", "01000001111", "IN_PROGRESS", 12 * 60);
    await inShop("Omar Hassan", "01000002222", "CHECKED_IN", 12 * 60 + 30);

    const body = await board();
    expect(body.inChair).toHaveLength(1);
    expect(body.waiting).toHaveLength(1);
    expect(body.waiting[0].position).toBe(1);
    expect(body.waiting[0].waitMinutes).toBeGreaterThanOrEqual(0);
  });

  it("gives first names only — a wall is not a customer list", async () => {
    await inShop("Ahmed Mohamed Samir", "01000001111", "IN_PROGRESS", 12 * 60);
    await inShop("Omar Hassan Fouad", "01000002222", "CHECKED_IN", 13 * 60);

    const body = await board();
    expect(body.inChair[0].name).toBe("Ahmed");
    expect(body.waiting[0].name).toBe("Omar");

    // And nothing else about them leaks onto the wall.
    const printed = JSON.stringify(body);
    expect(printed).not.toContain("Samir");
    expect(printed).not.toContain("Fouad");
    expect(printed).not.toContain("01000001111");
  });

  it("says nothing about people who have not arrived yet", async () => {
    await inShop("Later Today", "01000003333", "CHECKED_IN", 20 * 60);
    await testPrisma().appointment.create({
      data: {
        customerId: shop.customer.id,
        barberId: shop.barbers.abdullah,
        startAt: at(dayAhead(0), 21 * 60),
        endAt: at(dayAhead(0), 21 * 60 + 30),
        durationMinutes: 30,
        totalPrice: 300,
        status: "CONFIRMED",
      },
    });

    const body = await board();
    // Only the person actually in the shop.
    expect(body.waiting).toHaveLength(1);
    expect(body.inChair).toHaveLength(0);
  });

  it("leaves yesterday's shop off today's wall", async () => {
    await testPrisma().appointment.create({
      data: {
        customerId: shop.customer.id,
        barberId: shop.barbers.abdullah,
        startAt: at(dayAhead(-1), 12 * 60),
        endAt: at(dayAhead(-1), 12 * 60 + 30),
        durationMinutes: 30,
        totalPrice: 300,
        status: "IN_PROGRESS",
      },
    });

    expect((await board()).inChair).toHaveLength(0);
  });

  it("carries the offers that are running", async () => {
    await testPrisma().offer.create({
      data: { title: "Haircut and beard", price: 400, wasPrice: 500, isActive: true },
    });

    const body = await board();
    expect(body.offers).toHaveLength(1);
    expect(body.offers[0].price).toBe(400);
  });

  it("shows an empty shop as an empty shop, not as an error", async () => {
    const body = await board();
    expect(body.inChair).toEqual([]);
    expect(body.waiting).toEqual([]);
  });
});

describe("who may put it on a screen", () => {
  it("needs a signed-in device — the shop's day is nobody else's business", async () => {
    session = null;
    expect((await wall()).status).toBe(401);
  });

  it("is not a customer's to open", async () => {
    const login = await seedCustomerLogin(shop.customer.id);
    session = customerSession(login.id, login.customerId);
    expect((await wall()).status).toBe(401);
  });
});
