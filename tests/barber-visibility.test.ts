import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { at, customerSession, dayAhead, getRequest, jsonRequest, seedCustomerLogin, seedShop, staffSession, type Shop } from "./fixtures";
import { GET as getCatalog } from "@/app/api/customer/catalog/route";
import { GET as getCustomerSlots } from "@/app/api/customer/slots/route";
import { POST as bookAsCustomer } from "@/app/api/customer/appointments/route";
import { GET as getStaffSlots } from "@/app/api/booking/slots/route";
import { POST as bookAsStaff } from "@/app/api/appointments/route";
import { PATCH as updateBarber } from "@/app/api/barbers/[id]/route";

/**
 * Who the customer app shows. A barber record can belong to the owner or a
 * manager keeping their own sales, and the shop can hide anyone by hand — but
 * the till must still be able to book any of them.
 */

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("./db")).testPrisma() }));

let session: unknown = null;
vi.mock("next-auth", () => ({ getServerSession: async () => session }));

let shop: Shop;
let login: { id: string; customerId: string };
let day: string;

beforeAll(() => startTestDatabase());

beforeEach(async () => {
  await resetDatabase();
  shop = await seedShop();
  login = await seedCustomerLogin(shop.customer.id);
  session = customerSession(login.id, login.customerId);
  day = dayAhead(2);
});

const catalogBarbers = async () => (await (await getCatalog()).json()).barbers.map((b: { name: string }) => b.name);
const customerSlotBarbers = async () =>
  (await (await getCustomerSlots(getRequest(`/api/customer/slots?date=${day}&serviceIds=${shop.services.haircut}`))).json()).perBarber.map(
    (b: { barberName: string }) => b.barberName
  );

describe("a barber the shop has taken out of the app", () => {
  beforeEach(async () => {
    session = staffSession(shop.owner.id);
    await updateBarber(jsonRequest(`/api/barbers/${shop.barbers.khaled}`, { bookableOnline: false }, "PATCH"), {
      params: { id: shop.barbers.khaled },
    });
    session = customerSession(login.id, login.customerId);
  });

  it("is not offered anywhere in the customer app", async () => {
    expect(await catalogBarbers()).toEqual(["Abdullah"]);
    expect(await customerSlotBarbers()).toEqual(["Abdullah"]);
  });

  it("cannot be booked by asking for them directly", async () => {
    const res = await bookAsCustomer(
      jsonRequest("/api/customer/appointments", {
        barberId: shop.barbers.khaled,
        startAt: at(day, 12 * 60).toISOString(),
        serviceIds: [shop.services.haircut],
      })
    );
    expect(res.status).toBe(400);
  });

  it("is never picked when the customer says any barber", async () => {
    // Abdullah is busy, so "any barber" has only the hidden one left.
    session = staffSession(shop.owner.id);
    await bookAsStaff(
      jsonRequest("/api/appointments", {
        customerId: shop.customer.id,
        barberId: shop.barbers.abdullah,
        startAt: at(day, 12 * 60).toISOString(),
        serviceIds: [shop.services.haircut],
      })
    );
    session = customerSession(login.id, login.customerId);

    const res = await bookAsCustomer(
      jsonRequest("/api/customer/appointments", {
        startAt: at(day, 12 * 60).toISOString(),
        serviceIds: [shop.services.haircut],
      })
    );
    expect(res.status).toBe(409);
    expect(await testPrisma().appointment.count({ where: { barberId: shop.barbers.khaled } })).toBe(0);
  });

  it("can still be booked by the shop itself", async () => {
    session = staffSession(shop.owner.id);
    const res = await bookAsStaff(
      jsonRequest("/api/appointments", {
        customerId: shop.customer.id,
        barberId: shop.barbers.khaled,
        startAt: at(day, 12 * 60).toISOString(),
        serviceIds: [shop.services.haircut],
      })
    );
    expect(res.status).toBe(201);

    const { perBarber } = await (
      await getStaffSlots(getRequest(`/api/booking/slots?date=${day}&serviceIds=${shop.services.haircut}`))
    ).json();
    expect(perBarber.map((b: { barberName: string }) => b.barberName)).toContain("Khaled");
  });
});

describe("a barber record belonging to the owner or a manager", () => {
  beforeEach(async () => {
    // The owner keeps their own sales under a barber record of their own.
    await testPrisma().user.update({ where: { id: shop.owner.id }, data: { barberId: shop.barbers.khaled } });
  });

  it("never appears to customers, even with the switch left on", async () => {
    const barber = await testPrisma().barber.findUnique({ where: { id: shop.barbers.khaled } });
    expect(barber?.bookableOnline).toBe(true); // nobody has hidden them by hand

    expect(await catalogBarbers()).toEqual(["Abdullah"]);
    expect(await customerSlotBarbers()).toEqual(["Abdullah"]);
  });

  it("cannot be booked by a customer who names them", async () => {
    const res = await bookAsCustomer(
      jsonRequest("/api/customer/appointments", {
        barberId: shop.barbers.khaled,
        startAt: at(day, 12 * 60).toISOString(),
        serviceIds: [shop.services.haircut],
      })
    );
    expect(res.status).toBe(400);
  });

  it("still takes bookings made by the shop", async () => {
    session = staffSession(shop.owner.id);
    const res = await bookAsStaff(
      jsonRequest("/api/appointments", {
        customerId: shop.customer.id,
        barberId: shop.barbers.khaled,
        startAt: at(day, 13 * 60).toISOString(),
        serviceIds: [shop.services.haircut],
      })
    );
    expect(res.status).toBe(201);
  });
});

describe("a barber with their own login that is not staff", () => {
  it("is still shown, since they cut hair", async () => {
    const barberUser = await testPrisma().user.create({
      data: { name: "Khaled", phone: "01055551111", password: "x", role: "CUSTOMER", barberId: shop.barbers.khaled },
    });
    expect(barberUser.barberId).toBe(shop.barbers.khaled);
    expect(await catalogBarbers()).toEqual(["Abdullah", "Khaled"]);
  });
});

describe("choosing more than one service", () => {
  it("adds up the length and the price of everything chosen", async () => {
    const res = await getCustomerSlots(
      getRequest(`/api/customer/slots?date=${day}&serviceIds=${shop.services.haircut},${shop.services.beard}`)
    );
    const { durationMinutes, price, services } = await res.json();
    expect(services).toHaveLength(2);
    expect(durationMinutes).toBe(50); // 30 + 20
    expect(price).toBe(230); // 150 + 80
  });

  it("books them all as one appointment", async () => {
    const res = await bookAsCustomer(
      jsonRequest("/api/customer/appointments", {
        startAt: at(day, 12 * 60).toISOString(),
        serviceIds: [shop.services.haircut, shop.services.beard],
      })
    );
    expect(res.status).toBe(201);

    const appointment = await res.json();
    expect(appointment.services).toHaveLength(2);
    expect(appointment.durationMinutes).toBe(50);
    expect(appointment.totalPrice).toBe(230);
    expect(await testPrisma().appointment.count()).toBe(1);
  });
});
