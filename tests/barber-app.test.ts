import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { at, customerSession, dayAhead, getRequest, jsonRequest, seedShop, staffSession, type Shop } from "./fixtures";
import { GET as getToday } from "@/app/api/barber/today/route";
import { GET as getEarnings } from "@/app/api/barber/earnings/route";
import { GET as getCustomerFile, POST as addNote } from "@/app/api/barber/customers/[id]/route";
import { PATCH as markAppointment } from "@/app/api/barber/appointments/[id]/route";
import { POST as createAppointment } from "@/app/api/appointments/route";
import { POST as createVisit } from "@/app/api/visits/route";
import { POST as openDrawer } from "@/app/api/cash-drawer/route";

/**
 * A barber's own screens. As much about what they cannot see — the shop's
 * takings, another barber's work, a customer they have never served — as about
 * what they can.
 */

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("./db")).testPrisma() }));

let session: unknown = null;
vi.mock("next-auth", () => ({ getServerSession: async () => session }));

let shop: Shop;
let barberLogin: { id: string; barberId: string };

const barberSession = (userId: string, barberId: string) => ({
  user: { id: userId, email: "", name: "Abdullah", role: "BARBER", barberId },
  loginAt: Date.now(),
  expires: "",
});

beforeAll(() => startTestDatabase());

beforeEach(async () => {
  await resetDatabase();
  shop = await seedShop();
  const user = await testPrisma().user.create({
    data: {
      name: "Abdullah",
      email: "abdullah@escape.test",
      password: await bcrypt.hash("barber-password", 4),
      role: "BARBER",
      barberId: shop.barbers.abdullah,
    },
  });
  barberLogin = { id: user.id, barberId: shop.barbers.abdullah };
  session = barberSession(user.id, shop.barbers.abdullah);
});

/** A booking today, for whichever barber is asked for. */
async function bookToday(barberId: string, minutes: number, customerId = shop.customer.id) {
  session = staffSession(shop.owner.id);
  const res = await createAppointment(
    jsonRequest("/api/appointments", {
      customerId,
      barberId,
      startAt: at(dayAhead(0), minutes).toISOString(),
      serviceIds: [shop.services.haircut],
      source: "PHONE",
    })
  );
  session = barberSession(barberLogin.id, barberLogin.barberId);
  return res.json();
}

describe("a barber's day", () => {
  it("shows their own appointments and nobody else's", async () => {
    const mine = await bookToday(shop.barbers.abdullah, 12 * 60);
    await bookToday(shop.barbers.khaled, 13 * 60);

    const { appointments, summary } = await (await getToday(getRequest("/api/barber/today"))).json();
    expect(appointments).toHaveLength(1);
    expect(appointments[0].id).toBe(mine.id);
    expect(summary.open).toBe(1);
  });

  it("counts what they have earned today, not what the shop took", async () => {
    await testPrisma().barberSalarySettings.create({
      data: { barberId: shop.barbers.abdullah, baseSalary: 5000, commissionType: "PERCENT", commissionValue: 10 },
    });
    session = staffSession(shop.owner.id);
    await openDrawer(jsonRequest("/api/cash-drawer", { openingCash: 0 }));
    // One visit for this barber, one for the other.
    for (const barberId of [shop.barbers.abdullah, shop.barbers.khaled]) {
      await createVisit(
        jsonRequest("/api/visits", {
          customerId: shop.customer.id,
          barberId,
          items: [{ serviceId: shop.services.haircut, quantity: 1, priceAtTime: 200 }],
          paymentMethod: "CASH",
          tip: 30,
        })
      );
    }
    session = barberSession(barberLogin.id, barberLogin.barberId);

    const { earned } = await (await getToday(getRequest("/api/barber/today"))).json();
    expect(earned.visitCount).toBe(1);
    expect(earned.takings).toBe(200); // their own work only
    expect(earned.commission).toBe(20); // 10% of it
    expect(earned.tips).toBe(30);
  });

  it("is refused to anyone who is not a barber", async () => {
    session = staffSession(shop.owner.id);
    expect((await getToday(getRequest("/api/barber/today"))).status).toBe(401);
    session = customerSession("c1", shop.customer.id);
    expect((await getToday(getRequest("/api/barber/today"))).status).toBe(401);
    session = null;
    expect((await getToday(getRequest("/api/barber/today"))).status).toBe(401);
  });
});

describe("marking someone through the chair", () => {
  it("marks them arrived, then starts them", async () => {
    const appointment = await bookToday(shop.barbers.abdullah, 12 * 60);

    const arrived = await markAppointment(jsonRequest(`/api/barber/appointments/${appointment.id}`, { status: "CHECKED_IN" }, "PATCH"), {
      params: { id: appointment.id },
    });
    expect((await arrived.json()).status).toBe("CHECKED_IN");

    const started = await markAppointment(jsonRequest(`/api/barber/appointments/${appointment.id}`, { status: "IN_PROGRESS" }, "PATCH"), {
      params: { id: appointment.id },
    });
    const body = await started.json();
    expect(body.status).toBe("IN_PROGRESS");
    // Starting resets the clock to now.
    expect(Math.abs(new Date(body.startAt).getTime() - Date.now())).toBeLessThan(90_000);
  });

  it("marks a no-show", async () => {
    const appointment = await bookToday(shop.barbers.abdullah, 12 * 60);
    const res = await markAppointment(jsonRequest(`/api/barber/appointments/${appointment.id}`, { status: "NO_SHOW" }, "PATCH"), {
      params: { id: appointment.id },
    });
    expect((await res.json()).status).toBe("NO_SHOW");
  });

  it("cannot touch another barber's appointment", async () => {
    const theirs = await bookToday(shop.barbers.khaled, 13 * 60);
    const res = await markAppointment(jsonRequest(`/api/barber/appointments/${theirs.id}`, { status: "NO_SHOW" }, "PATCH"), {
      params: { id: theirs.id },
    });
    expect(res.status).toBe(404);
  });

  it("cannot cancel, complete, or otherwise take over the shop's job", async () => {
    const appointment = await bookToday(shop.barbers.abdullah, 12 * 60);
    for (const status of ["CANCELLED", "COMPLETED", "COMPLETED_UNPAID", "CONFIRMED"]) {
      const res = await markAppointment(jsonRequest(`/api/barber/appointments/${appointment.id}`, { status }, "PATCH"), {
        params: { id: appointment.id },
      });
      expect(res.status, status).toBe(400);
    }
    expect((await testPrisma().appointment.findUnique({ where: { id: appointment.id } }))?.status).toBe("CONFIRMED");
  });

  it("cannot re-open an appointment that has been rung up", async () => {
    const appointment = await bookToday(shop.barbers.abdullah, 12 * 60);
    session = staffSession(shop.owner.id);
    await openDrawer(jsonRequest("/api/cash-drawer", { openingCash: 0 }));
    await createVisit(
      jsonRequest("/api/visits", {
        customerId: shop.customer.id,
        barberId: shop.barbers.abdullah,
        appointmentId: appointment.id,
        items: [{ serviceId: shop.services.haircut, quantity: 1, priceAtTime: 150 }],
        paymentMethod: "CASH",
      })
    );
    session = barberSession(barberLogin.id, barberLogin.barberId);

    const res = await markAppointment(jsonRequest(`/api/barber/appointments/${appointment.id}`, { status: "IN_PROGRESS" }, "PATCH"), {
      params: { id: appointment.id },
    });
    expect(res.status).toBe(409);
  });
});

describe("a customer's file", () => {
  it("opens for a customer they have served, with their history", async () => {
    session = staffSession(shop.owner.id);
    await openDrawer(jsonRequest("/api/cash-drawer", { openingCash: 0 }));
    await createVisit(
      jsonRequest("/api/visits", {
        customerId: shop.customer.id,
        barberId: shop.barbers.abdullah,
        items: [{ serviceId: shop.services.haircut, quantity: 1, priceAtTime: 150 }],
        paymentMethod: "CASH",
      })
    );
    session = barberSession(barberLogin.id, barberLogin.barberId);

    const file = await (await getCustomerFile(getRequest(`/api/barber/customers/${shop.customer.id}`), { params: { id: shop.customer.id } })).json();
    expect(file.customer.name).toBe("Ahmed Mohamed");
    expect(file.visitCount).toBe(1);
    expect(file.totalSpent).toBe(150);
    expect(file.usual[0]).toEqual({ name: "Hair cut", count: 1 });
  });

  it("will not open a customer they have never served", async () => {
    const stranger = await testPrisma().customer.create({ data: { name: "Somebody else" } });
    const res = await getCustomerFile(getRequest(`/api/barber/customers/${stranger.id}`), { params: { id: stranger.id } });
    expect(res.status).toBe(404);
  });

  it("takes a note, and shows it back with who wrote it", async () => {
    await bookToday(shop.barbers.abdullah, 12 * 60); // enough to count as theirs
    const added = await addNote(jsonRequest(`/api/barber/customers/${shop.customer.id}`, { text: "Low fade, no talking" }), {
      params: { id: shop.customer.id },
    });
    expect(added.status).toBe(201);

    const file = await (await getCustomerFile(getRequest(`/api/barber/customers/${shop.customer.id}`), { params: { id: shop.customer.id } })).json();
    expect(file.notes[0].text).toBe("Low fade, no talking");
    expect(file.notes[0].barber.name).toBe("Abdullah");
  });

  it("refuses an empty note", async () => {
    await bookToday(shop.barbers.abdullah, 12 * 60);
    const res = await addNote(jsonRequest(`/api/barber/customers/${shop.customer.id}`, { text: "" }), {
      params: { id: shop.customer.id },
    });
    expect(res.status).toBe(400);
  });

  it("will not let a customer read the barber's notes about them", async () => {
    await bookToday(shop.barbers.abdullah, 12 * 60);
    await addNote(jsonRequest(`/api/barber/customers/${shop.customer.id}`, { text: "Tips well" }), {
      params: { id: shop.customer.id },
    });

    session = customerSession("c1", shop.customer.id);
    const res = await getCustomerFile(getRequest(`/api/barber/customers/${shop.customer.id}`), { params: { id: shop.customer.id } });
    expect(res.status).toBe(401);
  });
});

describe("earnings", () => {
  beforeEach(async () => {
    await testPrisma().barberSalarySettings.create({
      data: { barberId: shop.barbers.abdullah, baseSalary: 5000, commissionType: "PERCENT", commissionValue: 10 },
    });
  });

  it("adds up their week and month, and explains the rule", async () => {
    session = staffSession(shop.owner.id);
    await openDrawer(jsonRequest("/api/cash-drawer", { openingCash: 0 }));
    await createVisit(
      jsonRequest("/api/visits", {
        customerId: shop.customer.id,
        barberId: shop.barbers.abdullah,
        items: [{ serviceId: shop.services.haircut, quantity: 1, priceAtTime: 300 }],
        paymentMethod: "CASH",
        tip: 50,
      })
    );
    session = barberSession(barberLogin.id, barberLogin.barberId);

    const earnings = await (await getEarnings()).json();
    expect(earnings.month.commission).toBe(30);
    expect(earnings.month.tips).toBe(50);
    expect(earnings.commissionRule).toEqual({ type: "PERCENT", value: 10 });
    expect(earnings.days.length).toBeGreaterThan(0);
  });

  it("says nothing about anybody else's earnings", async () => {
    session = staffSession(shop.owner.id);
    await openDrawer(jsonRequest("/api/cash-drawer", { openingCash: 0 }));
    await createVisit(
      jsonRequest("/api/visits", {
        customerId: shop.customer.id,
        barberId: shop.barbers.khaled,
        items: [{ serviceId: shop.services.haircut, quantity: 1, priceAtTime: 1000 }],
        paymentMethod: "CASH",
      })
    );
    session = barberSession(barberLogin.id, barberLogin.barberId);

    const earnings = await (await getEarnings()).json();
    expect(earnings.month.visitTotal).toBe(0);
    expect(earnings.month.commission).toBe(0);
  });

  it("is refused to staff and customers alike", async () => {
    session = staffSession(shop.owner.id);
    expect((await getEarnings()).status).toBe(401);
    session = customerSession("c1", shop.customer.id);
    expect((await getEarnings()).status).toBe(401);
  });
});
