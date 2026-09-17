import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { customerSession, getRequest, jsonRequest, seedCustomerLogin, seedShop, staffSession, type Shop } from "./fixtures";
import { GET as getSettings, PATCH as saveSettings } from "@/app/api/settings/loyalty/route";
import { GET as getStanding, POST as giveReward } from "@/app/api/loyalty/[customerId]/route";
import { GET as getMe } from "@/app/api/customer/me/route";

/**
 * The punch card: a stamp per paid visit, a reward the till mentions, and a
 * record of every reward handed over. It must never move money by itself.
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
  session = staffSession(shop.owner.id);
});

/** Paid visits, which is what a stamp is. */
async function visits(count: number, customerId = shop.customer.id) {
  for (let i = 0; i < count; i++) {
    await testPrisma().visit.create({
      data: { customerId, barberId: shop.barbers.abdullah, total: 150, paymentMethod: "CASH", cashAmount: 150 },
    });
  }
}

const turnOn = (visitsRequired = 6) =>
  saveSettings(
    jsonRequest("/api/settings/loyalty", { enabled: true, visitsRequired, rewardText: "A free haircut" }, "PATCH")
  );

const standingOf = async (customerId = shop.customer.id) =>
  (await getStanding(getRequest("/api/loyalty/x"), { params: { customerId } })).json();

describe("setting the card up", () => {
  it("is off until the shop turns it on", async () => {
    const settings = await (await getSettings()).json();
    expect(settings.enabled).toBe(false);
  });

  it("remembers how many visits earn what", async () => {
    await turnOn(5);
    const settings = await (await getSettings()).json();
    expect(settings).toMatchObject({ enabled: true, visitsRequired: 5, rewardText: "A free haircut" });
  });

  it("refuses a card nobody could ever fill", async () => {
    expect((await saveSettings(jsonRequest("/api/settings/loyalty", { visitsRequired: 0 }, "PATCH"))).status).toBe(400);
    expect((await saveSettings(jsonRequest("/api/settings/loyalty", { visitsRequired: 500 }, "PATCH"))).status).toBe(400);
  });

  it("refuses a reward with nothing written in it", async () => {
    expect((await saveSettings(jsonRequest("/api/settings/loyalty", { rewardText: "   " }, "PATCH"))).status).toBe(400);
  });

  it("is not the cashier's to change, though they may read it", async () => {
    session = staffSession(shop.cashier.id, "CASHIER");
    expect((await saveSettings(jsonRequest("/api/settings/loyalty", { enabled: true }, "PATCH"))).status).toBe(401);
    expect((await getSettings()).status).toBe(200);
  });

  it("writes the change down in the activity log", async () => {
    await turnOn(4);
    const entry = await testPrisma().auditLog.findFirst({ where: { entityId: "loyalty" } });
    expect(entry?.summary).toContain("4 visits");
  });
});

describe("stamps", () => {
  it("counts paid visits, and nothing else", async () => {
    await turnOn(6);
    await visits(4);
    // A booking nobody paid for earns no stamp.
    await testPrisma().appointment.create({
      data: {
        customerId: shop.customer.id,
        barberId: shop.barbers.abdullah,
        startAt: new Date(),
        endAt: new Date(Date.now() + 1_800_000),
        durationMinutes: 30,
        totalPrice: 150,
        status: "COMPLETED_UNPAID",
      },
    });

    const { standing } = await standingOf();
    expect(standing.visits).toBe(4);
    expect(standing.stamps).toBe(4);
    expect(standing.toNext).toBe(2);
    expect(standing.available).toBe(0);
  });

  it("tells the till in words when a card is full", async () => {
    await turnOn(6);
    await visits(6);
    const body = await standingOf();
    expect(body.standing.available).toBe(1);
    expect(body.text).toBe("Reward ready: A free haircut");
  });

  it("keeps one customer's visits off another's card", async () => {
    await turnOn(6);
    const other = await testPrisma().customer.create({ data: { name: "Someone Else" } });
    await visits(6);
    expect((await standingOf(other.id)).standing.available).toBe(0);
  });
});

describe("giving the reward", () => {
  it("records it, and the card starts again", async () => {
    await turnOn(6);
    await visits(6);

    const res = await giveReward(jsonRequest("/api/loyalty/x", {}), { params: { customerId: shop.customer.id } });
    expect(res.status).toBe(201);
    expect((await res.json()).standing.available).toBe(0);
    expect(await testPrisma().loyaltyRedemption.count()).toBe(1);
  });

  it("changes no money by itself", async () => {
    await turnOn(6);
    await visits(6);
    const before = await testPrisma().visit.aggregate({ _sum: { total: true } });

    await giveReward(jsonRequest("/api/loyalty/x", {}), { params: { customerId: shop.customer.id } });

    const after = await testPrisma().visit.aggregate({ _sum: { total: true } });
    expect(after._sum.total).toBe(before._sum.total);
  });

  it("ties the reward to the visit it was given on", async () => {
    await turnOn(6);
    await visits(6);
    const visit = await testPrisma().visit.findFirstOrThrow();

    await giveReward(jsonRequest("/api/loyalty/x", { visitId: visit.id }), { params: { customerId: shop.customer.id } });
    expect((await testPrisma().loyaltyRedemption.findFirstOrThrow()).visitId).toBe(visit.id);
  });

  it("refuses a card that is not full", async () => {
    await turnOn(6);
    await visits(3);
    const res = await giveReward(jsonRequest("/api/loyalty/x", {}), { params: { customerId: shop.customer.id } });
    expect(res.status).toBe(409);
    expect(await testPrisma().loyaltyRedemption.count()).toBe(0);
  });

  it("refuses the same full card twice", async () => {
    await turnOn(6);
    await visits(6);
    await giveReward(jsonRequest("/api/loyalty/x", {}), { params: { customerId: shop.customer.id } });
    const second = await giveReward(jsonRequest("/api/loyalty/x", {}), { params: { customerId: shop.customer.id } });
    expect(second.status).toBe(409);
    expect(await testPrisma().loyaltyRedemption.count()).toBe(1);
  });

  it("gives a second reward once a second card fills", async () => {
    await turnOn(6);
    await visits(12);
    await giveReward(jsonRequest("/api/loyalty/x", {}), { params: { customerId: shop.customer.id } });
    const second = await giveReward(jsonRequest("/api/loyalty/x", {}), { params: { customerId: shop.customer.id } });
    expect(second.status).toBe(201);
    expect((await second.json()).standing.available).toBe(0);
  });

  it("refuses while loyalty is switched off", async () => {
    await visits(20);
    const res = await giveReward(jsonRequest("/api/loyalty/x", {}), { params: { customerId: shop.customer.id } });
    expect(res.status).toBe(409);
  });

  it("is refused to a customer trying it on their own card", async () => {
    await turnOn(6);
    await visits(6);
    session = customerSession(login.id, login.customerId);
    expect((await giveReward(jsonRequest("/api/loyalty/x", {}), { params: { customerId: shop.customer.id } })).status).toBe(401);
    expect(await testPrisma().loyaltyRedemption.count()).toBe(0);
  });
});

describe("what the customer sees", () => {
  it("shows them their own card", async () => {
    await turnOn(6);
    await visits(4);
    session = customerSession(login.id, login.customerId);

    const me = await (await getMe()).json();
    expect(me.loyalty).toMatchObject({ stamps: 4, toNext: 2, visitsRequired: 6, rewardText: "A free haircut" });
  });

  it("shows no card at all while the shop runs none", async () => {
    await visits(4);
    session = customerSession(login.id, login.customerId);
    expect((await (await getMe()).json()).loyalty).toBeNull();
  });
});
