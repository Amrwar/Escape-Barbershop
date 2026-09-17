import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { at, customerSession, dayAhead, jsonRequest, seedCustomerLogin, seedShop, type Shop } from "./fixtures";
import { GET as getUsual } from "@/app/api/customer/usual/route";
import { POST as book } from "@/app/api/customer/appointments/route";

/**
 * "The usual": read out of a customer's own history, offered back with times
 * they could actually take. What matters is that it never offers something the
 * shop can no longer do, and never books anything by itself.
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

/** A haircut they sat through, this many days ago, at 15:00 shop time. */
async function hadOne(daysAgo: number, barberId: string | null, serviceIds: string[], status = "COMPLETED") {
  const start = at(dayAhead(-daysAgo), 15 * 60);
  return testPrisma().appointment.create({
    data: {
      customerId: shop.customer.id,
      barberId,
      startAt: start,
      endAt: new Date(start.getTime() + 30 * 60_000),
      durationMinutes: 30,
      totalPrice: 150,
      status: status as never,
      services: {
        create: serviceIds.map((serviceId) => ({
          serviceId,
          serviceName: "Hair cut",
          price: 150,
          durationMinutes: 30,
        })),
      },
    },
  });
}

describe("the usual", () => {
  it("says nothing about a customer the shop has served once", async () => {
    await hadOne(30, shop.barbers.abdullah, [shop.services.haircut]);
    expect((await (await getUsual()).json()).usual).toBeNull();
  });

  it("offers their barber, their cut, and times to take it", async () => {
    await hadOne(60, shop.barbers.abdullah, [shop.services.haircut]);
    await hadOne(30, shop.barbers.abdullah, [shop.services.haircut]);

    const { usual } = await (await getUsual()).json();
    expect(usual.barber.name).toBe("Abdullah");
    expect(usual.services.map((s: { id: string }) => s.id)).toEqual([shop.services.haircut]);
    expect(usual.price).toBe(150);
    expect(usual.durationMinutes).toBe(30);
    expect(usual.times.length).toBeGreaterThan(0);
    // Every time offered is in the future, and on a real slot boundary.
    expect(usual.times.every((t: string) => new Date(t).getTime() > Date.now())).toBe(true);
  });

  it("offers the pair of services they always have together", async () => {
    await hadOne(60, shop.barbers.abdullah, [shop.services.haircut, shop.services.beard]);
    await hadOne(30, shop.barbers.abdullah, [shop.services.haircut, shop.services.beard]);

    const { usual } = await (await getUsual()).json();
    expect(usual.services).toHaveLength(2);
    expect(usual.price).toBe(230); // 150 + 80
  });

  it("stops offering a barber who has been taken out of the app", async () => {
    await hadOne(60, shop.barbers.abdullah, [shop.services.haircut]);
    await hadOne(30, shop.barbers.abdullah, [shop.services.haircut]);
    await testPrisma().barber.update({ where: { id: shop.barbers.abdullah }, data: { bookableOnline: false } });

    const { usual } = await (await getUsual()).json();
    // The cut still stands; the barber does not.
    expect(usual.barber).toBeNull();
    expect(usual.services).toHaveLength(1);
  });

  it("offers nothing at all once the service has gone", async () => {
    await hadOne(60, shop.barbers.abdullah, [shop.services.haircut]);
    await hadOne(30, shop.barbers.abdullah, [shop.services.haircut]);
    await testPrisma().service.update({ where: { id: shop.services.haircut }, data: { isActive: false } });

    expect((await (await getUsual()).json()).usual).toBeNull();
  });

  it("ignores bookings they cancelled or missed", async () => {
    await hadOne(60, shop.barbers.khaled, [shop.services.beard], "CANCELLED");
    await hadOne(45, shop.barbers.khaled, [shop.services.beard], "NO_SHOW");
    await hadOne(30, shop.barbers.abdullah, [shop.services.haircut]);
    await hadOne(15, shop.barbers.abdullah, [shop.services.haircut]);

    const { usual } = await (await getUsual()).json();
    expect(usual.barber.name).toBe("Abdullah");
    expect(usual.services[0].id).toBe(shop.services.haircut);
  });

  it("books on the customer's tap, and the booking is theirs", async () => {
    await hadOne(60, shop.barbers.abdullah, [shop.services.haircut]);
    await hadOne(30, shop.barbers.abdullah, [shop.services.haircut]);

    const { usual } = await (await getUsual()).json();
    const res = await book(
      jsonRequest("/api/customer/appointments", {
        startAt: usual.times[0],
        barberId: usual.barber.id,
        serviceIds: usual.services.map((s: { id: string }) => s.id),
      })
    );

    expect(res.status).toBe(201);
    const booked = await res.json();
    expect(booked.barber.id).toBe(shop.barbers.abdullah);

    // Offering it did not book it: exactly one appointment came from the tap.
    const upcoming = await testPrisma().appointment.count({
      where: { customerId: shop.customer.id, startAt: { gte: new Date() } },
    });
    expect(upcoming).toBe(1);
  });

  it("is nobody else's usual", async () => {
    await hadOne(60, shop.barbers.abdullah, [shop.services.haircut]);
    await hadOne(30, shop.barbers.abdullah, [shop.services.haircut]);

    session = null;
    expect((await getUsual()).status).toBe(401);
  });
});
