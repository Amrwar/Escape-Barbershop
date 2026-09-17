import bcrypt from "bcryptjs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { at, dayAhead, getRequest, jsonRequest, seedShop, staffSession, type Shop } from "./fixtures";
import { GET as myRequests, POST as askForTimeOff, DELETE as withdraw } from "@/app/api/barber/time-off/route";
import { GET as allTimeOff } from "@/app/api/time-off/route";
import { PATCH as answer } from "@/app/api/time-off/[id]/route";
import { POST as bookAsStaff } from "@/app/api/appointments/route";

/**
 * A barber asking for time off, and the owner answering.
 *
 * The rule that carries the whole feature: **asking blocks nothing**. Until
 * somebody says yes the diary keeps taking bookings, because a barber who could
 * empty their own week by asking is a diary the shop cannot trust.
 */

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("./db")).testPrisma() }));

let session: unknown = null;
vi.mock("next-auth", () => ({ getServerSession: async () => session }));

vi.mock("web-push", () => ({
  default: {
    generateVAPIDKeys: () => ({ publicKey: "k", privateKey: "k" }),
    setVapidDetails: () => undefined,
    sendNotification: async () => ({ statusCode: 201 }),
  },
}));

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

/** A whole day away, two days from now. */
const ask = (reason = "Family wedding", days = 2) =>
  askForTimeOff(
    jsonRequest("/api/barber/time-off", {
      startAt: at(dayAhead(days), 11 * 60).toISOString(),
      endAt: at(dayAhead(days), 23 * 60).toISOString(),
      reason,
    })
  );

/** The shop booking somebody in with that barber, on that day. */
const bookThatDay = (days = 2, minutes = 15 * 60) => {
  session = staffSession(shop.owner.id);
  return bookAsStaff(
    jsonRequest("/api/appointments", {
      customerId: shop.customer.id,
      barberId: shop.barbers.abdullah,
      startAt: at(dayAhead(days), minutes).toISOString(),
      serviceIds: [shop.services.haircut],
      source: "PHONE",
    })
  );
};

describe("asking", () => {
  it("puts the request in front of the owner", async () => {
    const res = await ask();
    expect(res.status).toBe(201);

    const row = await testPrisma().barberTimeOff.findFirstOrThrow();
    expect(row.status).toBe("REQUESTED");
    expect(row.reason).toBe("Family wedding");
  });

  it("blocks nothing at all until it is answered", async () => {
    await ask();

    // The diary carries on as if nothing had been asked.
    const booking = await bookThatDay();
    expect(booking.status).toBe(201);
  });

  it("refuses a span that ends before it starts, or one already gone", async () => {
    session = barberSession(barberLogin.id, barberLogin.barberId);
    const backwards = await askForTimeOff(
      jsonRequest("/api/barber/time-off", {
        startAt: at(dayAhead(2), 20 * 60).toISOString(),
        endAt: at(dayAhead(2), 12 * 60).toISOString(),
      })
    );
    expect(backwards.status).toBe(400);

    const past = await askForTimeOff(
      jsonRequest("/api/barber/time-off", {
        startAt: at(dayAhead(-3), 11 * 60).toISOString(),
        endAt: at(dayAhead(-3), 23 * 60).toISOString(),
      })
    );
    expect(past.status).toBe(400);
  });

  it("refuses to ask twice for the same days", async () => {
    await ask();
    expect((await ask()).status).toBe(409);
    expect(await testPrisma().barberTimeOff.count()).toBe(1);
  });

  it("can be taken back while nobody has answered", async () => {
    await ask();
    const { id } = await testPrisma().barberTimeOff.findFirstOrThrow();

    expect((await withdraw(getRequest(`/api/barber/time-off?id=${id}`))).status).toBe(200);
    expect(await testPrisma().barberTimeOff.count()).toBe(0);
  });

  it("cannot be taken back once it has been answered", async () => {
    await ask();
    const { id } = await testPrisma().barberTimeOff.findFirstOrThrow();

    session = staffSession(shop.owner.id);
    await answer(jsonRequest("/x", { approve: true }, "PATCH"), { params: { id } });

    session = barberSession(barberLogin.id, barberLogin.barberId);
    expect((await withdraw(getRequest(`/api/barber/time-off?id=${id}`))).status).toBe(409);
  });

  it("is each barber's own list, and nobody else's", async () => {
    await ask();

    const other = await testPrisma().user.create({
      data: {
        name: "Khaled",
        email: "khaled@escape.test",
        password: await bcrypt.hash("x", 4),
        role: "BARBER",
        barberId: shop.barbers.khaled,
      },
    });
    session = barberSession(other.id, shop.barbers.khaled);

    expect(await (await myRequests()).json()).toHaveLength(0);
  });
});

describe("answering", () => {
  async function pending() {
    await ask();
    const row = await testPrisma().barberTimeOff.findFirstOrThrow();
    session = staffSession(shop.owner.id);
    return row;
  }

  it("blocks the diary the moment it is approved", async () => {
    const request = await pending();
    await answer(jsonRequest("/x", { approve: true }, "PATCH"), { params: { id: request.id } });

    const booking = await bookThatDay();
    expect(booking.status).toBe(409);
    expect((await booking.json()).error).toContain("off");
  });

  it("leaves the diary alone when it is declined", async () => {
    const request = await pending();
    await answer(jsonRequest("/x", { approve: false }, "PATCH"), { params: { id: request.id } });

    expect((await bookThatDay()).status).toBe(201);
  });

  it("says what is already booked rather than dropping it silently", async () => {
    const request = await pending();
    await bookThatDay();

    session = staffSession(shop.owner.id);
    const res = await answer(jsonRequest("/x", { approve: true }, "PATCH"), { params: { id: request.id } });
    const body = await res.json();

    expect(body.bookingsInTheWay).toBe(1);
    // The customer's appointment is still standing: the shop moves it itself.
    expect(await testPrisma().appointment.count({ where: { status: "CONFIRMED" } })).toBe(1);
  });

  it("is written down, with who decided", async () => {
    const request = await pending();
    await answer(jsonRequest("/x", { approve: true }, "PATCH"), { params: { id: request.id } });

    const after = await testPrisma().barberTimeOff.findUniqueOrThrow({ where: { id: request.id } });
    expect(after.decidedById).toBe(shop.owner.id);
    expect(after.decidedAt).toBeTruthy();

    const entry = await testPrisma().auditLog.findFirstOrThrow({ where: { summary: { contains: "time off" } } });
    expect(entry.summary).toContain("Abdullah");
  });

  it("cannot be answered twice", async () => {
    const request = await pending();
    await answer(jsonRequest("/x", { approve: true }, "PATCH"), { params: { id: request.id } });
    expect((await answer(jsonRequest("/x", { approve: false }, "PATCH"), { params: { id: request.id } })).status).toBe(409);
  });

  it("is the owner's answer, not the cashier's", async () => {
    const request = await pending();
    session = staffSession(shop.cashier.id, "CASHIER");

    expect((await answer(jsonRequest("/x", { approve: true }, "PATCH"), { params: { id: request.id } })).status).toBe(401);
  });

  it("is certainly not the barber's own to approve", async () => {
    const request = await pending();
    session = barberSession(barberLogin.id, barberLogin.barberId);

    expect((await answer(jsonRequest("/x", { approve: true }, "PATCH"), { params: { id: request.id } })).status).toBe(401);
    expect((await testPrisma().barberTimeOff.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("REQUESTED");
  });
});

describe("the shop's list", () => {
  it("shows what has been asked for, with who asked", async () => {
    await ask();
    session = staffSession(shop.owner.id);

    const rows = await (await allTimeOff(getRequest("/api/time-off?status=REQUESTED"))).json();
    expect(rows).toHaveLength(1);
    expect(rows[0].barber.name).toBe("Abdullah");
    expect(rows[0].reason).toBe("Family wedding");
  });

  it("counts the shop's own entries as already approved", async () => {
    // What the owner writes straight into the diary needs no asking.
    await testPrisma().barberTimeOff.create({
      data: {
        barberId: shop.barbers.khaled,
        startAt: at(dayAhead(3), 11 * 60),
        endAt: at(dayAhead(3), 23 * 60),
        reason: "Entered by the shop",
      },
    });

    const row = await testPrisma().barberTimeOff.findFirstOrThrow({ where: { barberId: shop.barbers.khaled } });
    expect(row.status).toBe("APPROVED");
  });
});
