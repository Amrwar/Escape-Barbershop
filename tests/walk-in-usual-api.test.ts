import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { customerSession, seedCustomerLogin, seedShop, type Shop } from "./fixtures";
import { GET as myUsual } from "@/app/api/customer/usual/route";
import { GET as busy } from "@/app/api/customer/busy/route";

/**
 * "The usual" and "is it worth walking down now", for a shop that books almost
 * nothing.
 *
 * Both used to read appointments alone, so both said nothing to every customer
 * this shop has. A habit is a habit however the customer arrived.
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

/** A walk-in rung up at the till, so many days ago. */
async function walkIn({
  daysAgo,
  barberId = shop.barbers.abdullah as string | null,
  serviceId = shop.services.haircut,
  customerId = shop.customer.id,
}: { daysAgo: number; barberId?: string | null; serviceId?: string; customerId?: string }) {
  return testPrisma().visit.create({
    data: {
      customerId,
      barberId,
      visitAt: new Date(Date.now() - daysAgo * 86_400_000),
      total: 150,
      items: { create: [{ serviceId, priceAtTime: 150, quantity: 1 }] },
    },
  });
}

const read = async () => (await myUsual()).json();

describe("a habit read from walk-ins", () => {
  it("finds nothing from a single visit — that is a last time, not a usual", async () => {
    await walkIn({ daysAgo: 7 });
    expect((await read()).usual).toBeNull();
  });

  it("reads the barber and the cut once there is a pattern", async () => {
    await walkIn({ daysAgo: 7 });
    await walkIn({ daysAgo: 21 });
    await walkIn({ daysAgo: 35 });

    const { usual } = await read();
    expect(usual).not.toBeNull();
    expect(usual.barber.id).toBe(shop.barbers.abdullah);
    expect(usual.services.map((s: { id: string }) => s.id)).toEqual([shop.services.haircut]);
    expect(usual.from).toBe(3);
  });

  it("prefers the barber they actually keep going to", async () => {
    await walkIn({ daysAgo: 7 });
    await walkIn({ daysAgo: 21 });
    await walkIn({ daysAgo: 35, barberId: shop.barbers.khaled });

    expect((await read()).usual.barber.id).toBe(shop.barbers.abdullah);
  });

  it("still offers the cut when the barber has left", async () => {
    await walkIn({ daysAgo: 7 });
    await walkIn({ daysAgo: 21 });
    await testPrisma().barber.update({ where: { id: shop.barbers.abdullah }, data: { isActive: false } });

    const { usual } = await read();
    expect(usual).not.toBeNull();
    expect(usual.barber).toBeNull();
    expect(usual.services).toHaveLength(1);
  });

  it("offers nothing when the shop has stopped selling that cut online", async () => {
    await walkIn({ daysAgo: 7 });
    await walkIn({ daysAgo: 21 });
    await testPrisma().service.update({ where: { id: shop.services.haircut }, data: { bookableOnline: false } });

    expect((await read()).usual).toBeNull();
  });

  it("counts a booked cut and a walk-in towards the same habit", async () => {
    await walkIn({ daysAgo: 7 });

    const start = new Date(Date.now() - 21 * 86_400_000);
    await testPrisma().appointment.create({
      data: {
        customerId: shop.customer.id,
        barberId: shop.barbers.abdullah,
        startAt: start,
        endAt: new Date(start.getTime() + 30 * 60_000),
        durationMinutes: 30,
        totalPrice: 150,
        status: "COMPLETED",
        services: {
          create: [{ serviceId: shop.services.haircut, serviceName: "Hair cut", price: 150, durationMinutes: 30 }],
        },
      },
    });

    expect((await read()).usual.from).toBe(2);
  });

  it("never counts one cut twice when a booking was rung up", async () => {
    const visit = await walkIn({ daysAgo: 7 });
    const start = new Date(Date.now() - 7 * 86_400_000);
    const appointment = await testPrisma().appointment.create({
      data: {
        customerId: shop.customer.id,
        barberId: shop.barbers.abdullah,
        startAt: start,
        endAt: new Date(start.getTime() + 30 * 60_000),
        durationMinutes: 30,
        totalPrice: 150,
        status: "COMPLETED",
        visitId: visit.id,
        services: {
          create: [{ serviceId: shop.services.haircut, serviceName: "Hair cut", price: 150, durationMinutes: 30 }],
        },
      },
    });
    expect(appointment.visitId).toBe(visit.id);

    // One haircut, counted once — otherwise a rung-up booking would weigh double.
    await walkIn({ daysAgo: 30 });
    expect((await read()).usual.from).toBe(2);
  });

  it("reads nobody else's history", async () => {
    const other = await testPrisma().customer.create({ data: { name: "Mahmoud", phone: "01088887777" } });
    await walkIn({ daysAgo: 7, customerId: other.id });
    await walkIn({ daysAgo: 21, customerId: other.id });

    expect((await read()).usual).toBeNull();
  });

  it("turns away anyone not signed in", async () => {
    session = null;
    expect((await myUsual()).status).toBe(401);
  });
});

describe("how busy it is", () => {
  it("says nothing at all on a shop with no history", async () => {
    const answer = await (await busy()).json();
    expect(answer.live).toBeNull();
    expect(answer.typical).toBeNull();
  });

  it("does not invent a live queue out of an empty one", async () => {
    // Plenty of takings, nobody checked in: the shop rings walk-ins straight
    // through, so there is no queue to read and it must not claim there is.
    for (let day = 1; day <= 60; day++) await walkIn({ daysAgo: day });

    expect((await (await busy()).json()).live).toBeNull();
  });

  it("gives the live queue once the shop is actually running one", async () => {
    const start = new Date(Date.now() - 10 * 60_000);
    await testPrisma().appointment.create({
      data: {
        customerId: shop.customer.id,
        barberId: shop.barbers.abdullah,
        startAt: start,
        endAt: new Date(start.getTime() + 30 * 60_000),
        durationMinutes: 30,
        totalPrice: 150,
        status: "IN_PROGRESS",
      },
    });

    const answer = await (await busy()).json();
    expect(answer.live).not.toBeNull();
    expect(answer.live.inChair).toBe(1);
  });

  it("is open to anybody, because it is what the wall already says to the room", async () => {
    session = null;
    expect((await busy()).status).toBe(200);
  });
});
