import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { customerSession, seedCustomerLogin, seedShop, type Shop } from "./fixtures";
import { GET as roster } from "@/app/api/customer/roster/route";
import { GET as depositAddress } from "@/app/api/customer/deposit-address/route";
import { shopTime } from "@/lib/booking";

/**
 * Time off pinned to the SHOP's day, not the machine's.
 *
 * Anchoring to local midnight passed west of UTC and failed on CI, which runs
 * on it — the shop's day in Cairo starts three hours before UTC midnight, so
 * "today" from the runner's point of view was a different twenty-four hours.
 */
const shopDay = (dateISO: string) => ({
  startAt: new Date(shopTime(dateISO, 0, "Africa/Cairo")),
  endAt: new Date(shopTime(dateISO, 24 * 60, "Africa/Cairo")),
});

/**
 * Who is in, and where to send a deposit.
 *
 * The roster answers "is my barber in on Thursday", which customers have always
 * had to ring the shop to ask. The deposit address exists because the notice
 * asking for money was reading a staff-only endpoint, so every customer was
 * told to transfer a sum to nowhere at all.
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

const read = async () => (await roster()).json();
const today = () => read().then((d) => d.days[0]);

describe("who is in", () => {
  it("gives a week, starting today", async () => {
    const { days } = await read();
    expect(days).toHaveLength(7);
    expect(days[0].open).toBe(true);
  });

  it("lists the barbers a customer may actually book", async () => {
    const day = await today();
    expect(day.barbers.map((b: { name: string }) => b.name).sort()).toEqual(["Abdullah", "Khaled"]);
  });

  it("leaves out somebody the shop has hidden from the app", async () => {
    await testPrisma().barber.update({
      where: { id: shop.barbers.khaled },
      data: { bookableOnline: false },
    });

    const day = await today();
    expect(day.barbers.map((b: { name: string }) => b.name)).toEqual(["Abdullah"]);
  });

  it("leaves out somebody who has left", async () => {
    await testPrisma().barber.update({ where: { id: shop.barbers.abdullah }, data: { isActive: false } });
    expect((await today()).barbers.map((b: { name: string }) => b.name)).toEqual(["Khaled"]);
  });

  it("takes a barber off the day they are away", async () => {
    const day = await today();
    await testPrisma().barberTimeOff.create({
      data: { barberId: shop.barbers.abdullah, ...shopDay(day.date), status: "APPROVED" },
    });

    expect((await today()).barbers.map((b: { name: string }) => b.name)).toEqual(["Khaled"]);
  });

  it("changes nothing for time off nobody has approved yet", async () => {
    const day = await today();
    await testPrisma().barberTimeOff.create({
      data: { barberId: shop.barbers.abdullah, ...shopDay(day.date), status: "REQUESTED" },
    });

    // Asking blocks nothing here, exactly as it blocks nothing in the diary.
    expect((await today()).barbers).toHaveLength(2);
  });

  it("takes a barber off a weekday they do not work", async () => {
    const day = await today();
    await testPrisma().barberWorkingHours.create({
      data: {
        barberId: shop.barbers.khaled,
        weekday: day.weekday,
        startMinute: 9 * 60,
        endMinute: 24 * 60,
        isWorking: false,
      },
    });

    expect((await today()).barbers.map((b: { name: string }) => b.name)).toEqual(["Abdullah"]);
  });

  it("says the shop is shut, and nobody is in, on a closed day", async () => {
    const day = await today();
    await testPrisma().shopHours.update({ where: { weekday: day.weekday }, data: { isOpen: false } });

    const shut = await today();
    expect(shut.open).toBe(false);
    expect(shut.barbers).toEqual([]);
  });

  it("gives the hours the shop keeps that day", async () => {
    const day = await today();
    expect(day.opensAt).toBe(11 * 60);
    expect(day.closesAt).toBe(23 * 60);
  });

  it("never says why anybody is off", async () => {
    const day = await today();
    await testPrisma().barberTimeOff.create({
      data: {
        barberId: shop.barbers.abdullah,
        ...shopDay(day.date),
        status: "APPROVED",
        reason: "Hospital appointment",
      },
    });

    // A barber's reason for being away is theirs.
    expect(JSON.stringify(await read())).not.toContain("Hospital");
  });

  it("is open to anybody, like the hours on the door", async () => {
    session = null;
    expect((await roster()).status).toBe(200);
  });
});

describe("where to send a deposit", () => {
  const ADDRESS = "escape@instapay";

  async function owing(status: "EXPECTED" | "RECEIVED") {
    const start = new Date(Date.now() + 2 * 86_400_000);
    return testPrisma().appointment.create({
      data: {
        customerId: shop.customer.id,
        barberId: shop.barbers.abdullah,
        startAt: start,
        endAt: new Date(start.getTime() + 30 * 60_000),
        durationMinutes: 30,
        totalPrice: 2000,
        status: "CONFIRMED",
        depositAmount: 500,
        depositStatus: status,
      },
    });
  }

  beforeEach(async () => {
    await testPrisma().setting.upsert({
      where: { key: "deposit_instapay_address" },
      update: { value: ADDRESS },
      create: { key: "deposit_instapay_address", value: ADDRESS },
    });
  });

  it("tells a customer who has been asked for one", async () => {
    await owing("EXPECTED");
    expect((await (await depositAddress()).json()).instapay).toBe(ADDRESS);
  });

  it("tells nobody who has not been asked", async () => {
    expect((await (await depositAddress()).json()).instapay).toBeNull();
  });

  it("stops telling them once the shop has the money", async () => {
    await owing("RECEIVED");
    expect((await (await depositAddress()).json()).instapay).toBeNull();
  });

  it("turns away anyone not signed in", async () => {
    await owing("EXPECTED");
    session = null;
    expect((await depositAddress()).status).toBe(401);
  });
});
