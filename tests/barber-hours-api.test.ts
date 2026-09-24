import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import {
  at,
  clock,
  customerSession,
  dayAhead,
  getRequest,
  jsonRequest,
  seedCustomerLogin,
  seedShop,
  staffSession,
  type Shop,
} from "./fixtures";
import { GET as readHours, PUT as setHours, DELETE as clearHours } from "@/app/api/barbers/[id]/hours/route";
import { GET as slots } from "@/app/api/customer/slots/route";
import { GET as roster } from "@/app/api/customer/roster/route";

/**
 * When one barber actually works.
 *
 * `BarberWorkingHours` was in the schema from the start and read by both the
 * slot maths and the roster, with nothing anywhere able to write a row — so
 * every barber silently worked the shop's whole day, and with online booking on
 * a customer could book anyone at any open hour.
 *
 * The rule that matters: these only ever NARROW the shop's day. A mistake here
 * can offer a customer less time, never more.
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

/** Free times are a customer's question, so ask them as one. */
const asCustomer = async <T>(run: () => Promise<T>): Promise<T> => {
  const staff = session;
  session = customerSession(login.id, login.customerId);
  try {
    return await run();
  } finally {
    session = staff;
  }
};

/** The seeded shop opens 11:00–23:00 every day. */
const week = (over: Partial<Record<number, { startMinute: number; endMinute: number; isWorking?: boolean }>> = {}) =>
  [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    startMinute: 11 * 60,
    endMinute: 23 * 60,
    isWorking: true,
    ...(over[weekday] ?? {}),
  }));

const put = (id: string, hours: unknown) =>
  setHours(jsonRequest(`/api/barbers/${id}/hours`, { hours }, "PUT"), { params: { id } });

const read = async (id: string) =>
  (await readHours(getRequest(`/api/barbers/${id}/hours`), { params: { id } })).json();

describe("setting a barber's week", () => {
  it("saves all seven days and reads them back", async () => {
    expect((await put(shop.barbers.abdullah, week())).status).toBe(200);

    const { hours } = await read(shop.barbers.abdullah);
    expect(hours).toHaveLength(7);
    expect(hours.every((h: { isWorking: boolean }) => h.isWorking)).toBe(true);
  });

  it("replaces the week rather than piling a second one on top", async () => {
    await put(shop.barbers.abdullah, week());
    await put(shop.barbers.abdullah, week({ 1: { startMinute: 15 * 60, endMinute: 20 * 60 } }));

    const { hours } = await read(shop.barbers.abdullah);
    expect(hours).toHaveLength(7);
    expect(hours.find((h: { weekday: number }) => h.weekday === 1).startMinute).toBe(15 * 60);
  });

  it("insists on the whole week, because a half-set rota is an invisible gap", async () => {
    expect((await put(shop.barbers.abdullah, week().slice(0, 4))).status).toBe(400);
    expect((await put(shop.barbers.abdullah, [])).status).toBe(400);
  });

  it("refuses a day that finishes before it starts", async () => {
    expect((await put(shop.barbers.abdullah, week({ 3: { startMinute: 20 * 60, endMinute: 14 * 60 } }))).status).toBe(400);
  });

  it("allows a day off to carry any times, since they are not used", async () => {
    const res = await put(
      shop.barbers.abdullah,
      week({ 5: { startMinute: 0, endMinute: 0, isWorking: false } })
    );
    expect(res.status).toBe(200);
  });

  it("clears back to the shop's hours", async () => {
    await put(shop.barbers.abdullah, week());
    expect((await clearHours(getRequest("/x"), { params: { id: shop.barbers.abdullah } })).status).toBe(200);
    expect((await read(shop.barbers.abdullah)).hours).toEqual([]);
  });

  it("is the owner's to change, though any staff may read it", async () => {
    session = staffSession(shop.cashier.id, "CASHIER");
    expect((await put(shop.barbers.abdullah, week())).status).toBe(401);
    expect((await readHours(getRequest("/x"), { params: { id: shop.barbers.abdullah } })).status).toBe(200);
  });

  it("refuses a barber who does not exist", async () => {
    expect((await put("no-such-barber", week())).status).toBe(404);
  });
});

describe("what the booking engine does with them", () => {
  const day = dayAhead(2);
  const weekdayOf = (iso: string) => new Date(`${iso}T12:00:00.000Z`).getUTCDay();

  it("stops offering times outside the barber's own hours", async () => {
    const wd = weekdayOf(day);
    await put(shop.barbers.abdullah, week({ [wd]: { startMinute: 15 * 60, endMinute: 18 * 60 } }));

    const res = await asCustomer(() =>
      slots(getRequest(`/api/customer/slots?date=${day}&serviceIds=${shop.services.haircut}&barberId=${shop.barbers.abdullah}`))
    );
    const times = (await res.json()).anyBarber.map(clock);

    expect(times.length).toBeGreaterThan(0);
    expect(times[0]).toBe("15:00");
    // Nothing may start late enough to finish after 18:00.
    expect(times.every((c: string) => c <= "17:30")).toBe(true);
  });

  it("never widens the shop's day, however early the barber claims to start", async () => {
    const wd = weekdayOf(day);
    // Opening at 06:00 when the shop opens at 11:00 must change nothing.
    await put(shop.barbers.abdullah, week({ [wd]: { startMinute: 6 * 60, endMinute: 23 * 60 } }));

    const res = await asCustomer(() =>
      slots(getRequest(`/api/customer/slots?date=${day}&serviceIds=${shop.services.haircut}&barberId=${shop.barbers.abdullah}`))
    );
    const times = (await res.json()).anyBarber.map(clock);
    expect(times[0]).toBe("11:00");
  });

  it("offers nothing at all on a day they do not work", async () => {
    const wd = weekdayOf(day);
    await put(shop.barbers.abdullah, week({ [wd]: { startMinute: 0, endMinute: 0, isWorking: false } }));

    const res = await asCustomer(() =>
      slots(getRequest(`/api/customer/slots?date=${day}&serviceIds=${shop.services.haircut}&barberId=${shop.barbers.abdullah}`))
    );
    expect((await res.json()).anyBarber).toEqual([]);
  });

  it("leaves the other barber alone", async () => {
    const wd = weekdayOf(day);
    await put(shop.barbers.abdullah, week({ [wd]: { startMinute: 0, endMinute: 0, isWorking: false } }));

    const res = await asCustomer(() =>
      slots(getRequest(`/api/customer/slots?date=${day}&serviceIds=${shop.services.haircut}&barberId=${shop.barbers.khaled}`))
    );
    expect((await res.json()).anyBarber.length).toBeGreaterThan(0);
  });

  it("takes them off the roster for the days they do not work", async () => {
    const today = await (await roster()).json().then((d: { days: { weekday: number; date: string }[] }) => d.days[0]);
    await put(shop.barbers.abdullah, week({ [today.weekday]: { startMinute: 0, endMinute: 0, isWorking: false } }));

    const after = await (await roster()).json();
    expect(after.days[0].barbers.map((b: { name: string }) => b.name)).toEqual(["Khaled"]);
  });
});

describe("a barber with no hours of their own", () => {
  it("works the shop's whole day, as before any of this existed", async () => {
    const day = dayAhead(2);
    const res = await asCustomer(() =>
      slots(getRequest(`/api/customer/slots?date=${day}&serviceIds=${shop.services.haircut}&barberId=${shop.barbers.abdullah}`))
    );
    const times = (await res.json()).anyBarber.map(clock);
    expect(times[0]).toBe("11:00");
    expect(at(day, 0)).toBeInstanceOf(Date);
  });
});
