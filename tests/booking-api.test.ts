import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { at, clock, customerSession, dayAhead, getRequest, jsonRequest, seedShop, staffSession, type Shop } from "./fixtures";
import { GET as listAppointments, POST as createAppointment } from "@/app/api/appointments/route";
import { PATCH as updateAppointment, DELETE as cancelAppointment } from "@/app/api/appointments/[id]/route";
import { GET as getSlots } from "@/app/api/booking/slots/route";
import { PUT as saveSettings } from "@/app/api/booking/settings/route";

/**
 * The shop's booking API, against a real Postgres. These are the tests that can
 * catch what unit tests cannot: clashes, transactions, and what the database
 * actually holds afterwards.
 */

// Everything under test reaches the database through this one module.
vi.mock("@/lib/prisma", async () => ({ prisma: (await import("./db")).testPrisma() }));

// The session the route sees. Set per test.
let session: unknown = null;
vi.mock("next-auth", () => ({ getServerSession: async () => session }));


let shop: Shop;
let day: string;

beforeAll(() => startTestDatabase());

beforeEach(async () => {
  await resetDatabase();
  shop = await seedShop();
  session = staffSession(shop.owner.id);
  day = dayAhead(2);
});

const book = (body: Record<string, unknown>) => createAppointment(jsonRequest("/api/appointments", body));
const slotsFor = (serviceIds: string[], extra = "") =>
  getSlots(getRequest(`/api/booking/slots?date=${day}&serviceIds=${serviceIds.join(",")}${extra}`));

describe("booking an appointment", () => {
  it("saves the services as quoted, and works out the end time", async () => {
    const res = await book({
      customerId: shop.customer.id,
      barberId: shop.barbers.abdullah,
      startAt: at(day, 12 * 60).toISOString(),
      serviceIds: [shop.services.haircut, shop.services.beard],
      source: "PHONE",
    });
    expect(res.status).toBe(201);

    const appointment = await res.json();
    expect(appointment.durationMinutes).toBe(50);
    expect(appointment.totalPrice).toBe(230);
    expect(clock(appointment.startAt)).toBe("12:00");
    expect(clock(appointment.endAt)).toBe("12:50");
    // The lines come back in database order, which is not promised either way.
    expect(appointment.services.map((s: { serviceName: string }) => s.serviceName).sort()).toEqual(["Beard cut", "Hair cut"]);
  });

  it("keeps the price it was booked at when the price list changes later", async () => {
    const res = await book({
      customerId: shop.customer.id,
      startAt: at(day, 12 * 60).toISOString(),
      serviceIds: [shop.services.haircut],
    });
    const { id } = await res.json();

    await testPrisma().service.update({ where: { id: shop.services.haircut }, data: { defaultPrice: 500 } });

    const stored = await testPrisma().appointment.findUnique({ where: { id }, include: { services: true } });
    expect(stored?.totalPrice).toBe(150);
    expect(stored?.services[0].price).toBe(150);
  });

  it("refuses a second booking over the same barber and time", async () => {
    const start = at(day, 12 * 60).toISOString();
    const first = await book({ customerId: shop.customer.id, barberId: shop.barbers.abdullah, startAt: start, serviceIds: [shop.services.haircut] });
    expect(first.status).toBe(201);

    const second = await book({ customerId: shop.customer.id, barberId: shop.barbers.abdullah, startAt: start, serviceIds: [shop.services.haircut] });
    expect(second.status).toBe(409);
    expect((await second.json()).error).toMatch(/just been taken/i);
    expect(await testPrisma().appointment.count()).toBe(1);
  });

  it("refuses an overlap that starts partway through another booking", async () => {
    await book({ customerId: shop.customer.id, barberId: shop.barbers.abdullah, startAt: at(day, 12 * 60).toISOString(), serviceIds: [shop.services.haircut] });
    const overlapping = await book({
      customerId: shop.customer.id,
      barberId: shop.barbers.abdullah,
      startAt: at(day, 12 * 60 + 15).toISOString(),
      serviceIds: [shop.services.haircut],
    });
    expect(overlapping.status).toBe(409);
  });

  it("allows the same time with a different barber", async () => {
    const start = at(day, 12 * 60).toISOString();
    await book({ customerId: shop.customer.id, barberId: shop.barbers.abdullah, startAt: start, serviceIds: [shop.services.haircut] });
    const other = await book({ customerId: shop.customer.id, barberId: shop.barbers.khaled, startAt: start, serviceIds: [shop.services.haircut] });
    expect(other.status).toBe(201);
  });

  it("picks a free barber when the customer does not mind", async () => {
    const start = at(day, 12 * 60).toISOString();
    const first = await book({ customerId: shop.customer.id, startAt: start, serviceIds: [shop.services.haircut] });
    const second = await book({ customerId: shop.customer.id, startAt: start, serviceIds: [shop.services.haircut] });
    const third = await book({ customerId: shop.customer.id, startAt: start, serviceIds: [shop.services.haircut] });

    expect([first.status, second.status]).toEqual([201, 201]);
    const names = [(await first.json()).barber.name, (await second.json()).barber.name];
    expect(new Set(names).size).toBe(2); // both barbers used
    expect(third.status).toBe(409); // nobody left
    expect((await third.json()).error).toMatch(/no barber is free/i);
  });

  it("refuses a time outside opening hours", async () => {
    const res = await book({
      customerId: shop.customer.id,
      barberId: shop.barbers.abdullah,
      startAt: at(day, 23 * 60 + 30).toISOString(),
      serviceIds: [shop.services.haircut],
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/working hours/i);
  });

  it("refuses a booking that would run past closing time", async () => {
    const res = await book({
      customerId: shop.customer.id,
      barberId: shop.barbers.abdullah,
      // 22:30 plus two hours of protein finishes after the shop shuts at 23:00
      startAt: at(day, 22 * 60 + 30).toISOString(),
      serviceIds: [shop.services.protein],
    });
    expect(res.status).toBe(409);
  });

  it("refuses a barber who does not do the service", async () => {
    await testPrisma().barberService.create({ data: { barberId: shop.barbers.abdullah, serviceId: shop.services.haircut } });
    const res = await book({
      customerId: shop.customer.id,
      barberId: shop.barbers.abdullah,
      startAt: at(day, 12 * 60).toISOString(),
      serviceIds: [shop.services.beard],
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/does not do/i);
  });

  it("refuses an unknown service", async () => {
    const res = await book({ customerId: shop.customer.id, startAt: at(day, 12 * 60).toISOString(), serviceIds: ["nope"] });
    expect(res.status).toBe(400);
  });

  it("keeps a walk-in without a barber", async () => {
    const res = await book({
      customerId: shop.customer.id,
      startAt: at(day, 12 * 60).toISOString(),
      serviceIds: [shop.services.haircut],
      source: "WALK_IN",
    });
    expect(res.status).toBe(201);
    expect((await res.json()).barber).toBeNull();
  });

  it("writes an entry in the activity trail", async () => {
    await book({ customerId: shop.customer.id, startAt: at(day, 12 * 60).toISOString(), serviceIds: [shop.services.haircut] });
    const log = await testPrisma().auditLog.findFirst({ where: { entity: "APPOINTMENT" } });
    expect(log?.action).toBe("CREATE");
    expect(log?.summary).toMatch(/Ahmed Mohamed/);
  });
});

describe("free times", () => {
  it("offers the working day on the shop's grid", async () => {
    const res = await slotsFor([shop.services.haircut]);
    const { anyBarber, durationMinutes, price } = await res.json();
    expect(durationMinutes).toBe(30);
    expect(price).toBe(150);
    expect(clock(anyBarber[0])).toBe("11:00");
    expect(clock(anyBarber[1])).toBe("11:15");
    expect(clock(anyBarber.at(-1))).toBe("22:30");
  });

  it("stops offering a time once both barbers are taken", async () => {
    const start = at(day, 12 * 60).toISOString();
    await book({ customerId: shop.customer.id, barberId: shop.barbers.abdullah, startAt: start, serviceIds: [shop.services.haircut] });
    const stillThere = await (await slotsFor([shop.services.haircut])).json();
    expect(stillThere.anyBarber).toContain(start);

    await book({ customerId: shop.customer.id, barberId: shop.barbers.khaled, startAt: start, serviceIds: [shop.services.haircut] });
    const gone = await (await slotsFor([shop.services.haircut])).json();
    expect(gone.anyBarber).not.toContain(start);
  });

  it("frees the time again when the booking is cancelled", async () => {
    const start = at(day, 12 * 60).toISOString();
    const res = await book({ customerId: shop.customer.id, barberId: shop.barbers.abdullah, startAt: start, serviceIds: [shop.services.haircut] });
    const { id } = await res.json();

    const perBarberBefore = await (await slotsFor([shop.services.haircut], `&barberId=${shop.barbers.abdullah}`)).json();
    expect(perBarberBefore.anyBarber).not.toContain(start);

    await cancelAppointment(getRequest(`/api/appointments/${id}`), { params: { id } });

    const perBarberAfter = await (await slotsFor([shop.services.haircut], `&barberId=${shop.barbers.abdullah}`)).json();
    expect(perBarberAfter.anyBarber).toContain(start);
  });

  it("leaves no gap smaller than the service", async () => {
    // Fill 11:00–11:30 and 12:00–12:30 for the only barber offered.
    await testPrisma().barber.update({ where: { id: shop.barbers.khaled }, data: { isActive: false } });
    await book({ customerId: shop.customer.id, barberId: shop.barbers.abdullah, startAt: at(day, 11 * 60).toISOString(), serviceIds: [shop.services.haircut] });
    await book({ customerId: shop.customer.id, barberId: shop.barbers.abdullah, startAt: at(day, 12 * 60).toISOString(), serviceIds: [shop.services.haircut] });

    const { anyBarber } = await (await slotsFor([shop.services.haircut])).json();
    // 11:30 fits exactly in the half-hour gap; 11:45 would overrun into 12:00.
    expect(anyBarber.map(clock)).toContain("11:30");
    expect(anyBarber.map(clock)).not.toContain("11:45");
  });

  it("honours a buffer between appointments", async () => {
    await saveSettings(jsonRequest("/api/booking/settings", { settings: { bufferMinutes: 15 } }, "PUT"));
    await testPrisma().barber.update({ where: { id: shop.barbers.khaled }, data: { isActive: false } });
    await book({ customerId: shop.customer.id, barberId: shop.barbers.abdullah, startAt: at(day, 12 * 60).toISOString(), serviceIds: [shop.services.haircut] });

    const { anyBarber } = await (await slotsFor([shop.services.haircut])).json();
    const times = anyBarber.map(clock);
    expect(times).not.toContain("11:45"); // would end at 12:15, inside the buffer
    expect(times).not.toContain("12:30"); // starts inside the buffer after 12:30
    expect(times).toContain("12:45");
  });

  it("offers nothing on a day the shop is closed", async () => {
    const weekday = new Date(at(day, 12 * 60)).getDay();
    await testPrisma().shopHours.update({ where: { weekday }, data: { isOpen: false } });
    const { anyBarber } = await (await slotsFor([shop.services.haircut])).json();
    expect(anyBarber).toEqual([]);
  });

  it("respects a barber's own shorter day", async () => {
    await testPrisma().barber.update({ where: { id: shop.barbers.khaled }, data: { isActive: false } });
    const weekday = new Date(at(day, 12 * 60)).getDay();
    await testPrisma().barberWorkingHours.create({
      data: { barberId: shop.barbers.abdullah, weekday, startMinute: 14 * 60, endMinute: 18 * 60 },
    });

    const { anyBarber } = await (await slotsFor([shop.services.haircut])).json();
    expect(clock(anyBarber[0])).toBe("14:00");
    expect(clock(anyBarber.at(-1))).toBe("17:30");
  });

  it("blocks time off", async () => {
    await testPrisma().barber.update({ where: { id: shop.barbers.khaled }, data: { isActive: false } });
    await testPrisma().barberTimeOff.create({
      data: { barberId: shop.barbers.abdullah, startAt: at(day, 11 * 60), endAt: at(day, 15 * 60), reason: "Holiday" },
    });

    const { anyBarber } = await (await slotsFor([shop.services.haircut])).json();
    expect(clock(anyBarber[0])).toBe("15:00");
  });
});

describe("changing an appointment", () => {
  const bookOne = async (minutes = 12 * 60) => {
    const res = await book({
      customerId: shop.customer.id,
      barberId: shop.barbers.abdullah,
      startAt: at(day, minutes).toISOString(),
      serviceIds: [shop.services.haircut],
    });
    return res.json();
  };

  it("moves it to another time", async () => {
    const appointment = await bookOne();
    const res = await updateAppointment(
      jsonRequest(`/api/appointments/${appointment.id}`, { startAt: at(day, 15 * 60).toISOString() }, "PATCH"),
      { params: { id: appointment.id } }
    );
    expect(res.status).toBe(200);
    const moved = await res.json();
    expect(clock(moved.startAt)).toBe("15:00");
    expect(clock(moved.endAt)).toBe("15:30");
  });

  it("refuses a move onto another booking", async () => {
    const first = await bookOne(12 * 60);
    await book({
      customerId: shop.customer.id,
      barberId: shop.barbers.abdullah,
      startAt: at(day, 15 * 60).toISOString(),
      serviceIds: [shop.services.haircut],
    });

    const res = await updateAppointment(
      jsonRequest(`/api/appointments/${first.id}`, { startAt: at(day, 15 * 60).toISOString() }, "PATCH"),
      { params: { id: first.id } }
    );
    expect(res.status).toBe(409);
  });

  it("re-quotes and re-times when the services change", async () => {
    const appointment = await bookOne();
    const res = await updateAppointment(
      jsonRequest(`/api/appointments/${appointment.id}`, { serviceIds: [shop.services.haircut, shop.services.beard] }, "PATCH"),
      { params: { id: appointment.id } }
    );
    const updated = await res.json();
    expect(updated.durationMinutes).toBe(50);
    expect(updated.totalPrice).toBe(230);
    expect(clock(updated.endAt)).toBe("12:50");
  });

  it("lets the same appointment keep its own slot when only the services shrink", async () => {
    const appointment = await bookOne();
    const res = await updateAppointment(
      jsonRequest(`/api/appointments/${appointment.id}`, { serviceIds: [shop.services.beard] }, "PATCH"),
      { params: { id: appointment.id } }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).durationMinutes).toBe(20);
  });

  it("records who was marked as not turning up", async () => {
    const appointment = await bookOne();
    const res = await updateAppointment(jsonRequest(`/api/appointments/${appointment.id}`, { status: "NO_SHOW" }, "PATCH"), {
      params: { id: appointment.id },
    });
    expect((await res.json()).status).toBe("NO_SHOW");
  });

  it("keeps a cancelled appointment, with its reason", async () => {
    const appointment = await bookOne();
    const res = await cancelAppointment(getRequest(`/api/appointments/${appointment.id}?reason=Called%20off`), {
      params: { id: appointment.id },
    });
    const cancelled = await res.json();
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancelReason).toBe("Called off");
    expect(await testPrisma().appointment.count()).toBe(1);
  });
});

describe("who may use the shop's booking API", () => {
  it("turns away a customer login", async () => {
    session = customerSession("user-1", shop.customer.id);
    expect((await listAppointments(getRequest("/api/appointments"))).status).toBe(401);
    expect((await book({ customerId: shop.customer.id, startAt: at(day, 12 * 60).toISOString(), serviceIds: [shop.services.haircut] })).status).toBe(401);
  });

  it("turns away nobody at all", async () => {
    session = null;
    expect((await listAppointments(getRequest("/api/appointments"))).status).toBe(401);
    expect((await slotsFor([shop.services.haircut])).status).toBe(401);
  });

  it("lets a cashier book, but only an owner change the settings", async () => {
    session = staffSession(shop.cashier.id, "CASHIER");
    const booked = await book({ customerId: shop.customer.id, startAt: at(day, 12 * 60).toISOString(), serviceIds: [shop.services.haircut] });
    expect(booked.status).toBe(201);

    const settings = await saveSettings(jsonRequest("/api/booking/settings", { settings: { bufferMinutes: 5 } }, "PUT"));
    expect(settings.status).toBe(401);
  });
});
