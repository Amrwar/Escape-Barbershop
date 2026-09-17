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
import { POST as register } from "@/app/api/customer/register/route";
import { GET as getProfile, PATCH as updateProfile } from "@/app/api/customer/me/route";
import { GET as getCatalog } from "@/app/api/customer/catalog/route";
import { GET as getCustomerSlots } from "@/app/api/customer/slots/route";
import { GET as listMine, POST as bookMine } from "@/app/api/customer/appointments/route";
import { PATCH as moveMine, DELETE as cancelMine } from "@/app/api/customer/appointments/[id]/route";
import { POST as staffBook } from "@/app/api/appointments/route";
import { PUT as saveSettings } from "@/app/api/booking/settings/route";

/**
 * The customer app's API: what a customer may do, what they may not, and what
 * the shop sees afterwards.
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

const book = (body: Record<string, unknown>) => bookMine(jsonRequest("/api/customer/appointments", body));

describe("signing up", () => {
  it("creates a login and attaches it to the shop's record for that number", async () => {
    await resetDatabase();
    shop = await seedShop(); // customer "Ahmed Mohamed" on 01099998888, no login yet
    session = null;

    const res = await register(jsonRequest("/api/customer/register", { name: "Ahmed", phone: "010 9999 8888", password: "secret123" }));
    expect(res.status).toBe(201);

    const user = await testPrisma().user.findFirst({ where: { phone: "01099998888" } });
    expect(user?.role).toBe("CUSTOMER");
    expect(user?.customerId).toBe(shop.customer.id); // their history carries over
    expect(await testPrisma().customer.count()).toBe(1);
  });

  it("makes a new record when the shop has two customers on that number", async () => {
    // Nobody has claimed the number yet, but the shop has it twice: too
    // ambiguous to attach to either, so the new customer gets their own record.
    await testPrisma().user.delete({ where: { id: login.id } });
    await testPrisma().customer.create({ data: { name: "Someone else", phone: "01099998888" } });
    session = null;
    const res = await register(jsonRequest("/api/customer/register", { name: "Third", phone: "01099998888", password: "secret123" }));
    expect(res.status).toBe(201);
    expect(await testPrisma().customer.count()).toBe(3);
  });

  it("refuses a number that already has a login", async () => {
    session = null;
    const res = await register(jsonRequest("/api/customer/register", { name: "Ahmed", phone: "01099998888", password: "secret123" }));
    expect(res.status).toBe(409);
  });

  it("refuses a number that is not an Egyptian mobile", async () => {
    session = null;
    const res = await register(jsonRequest("/api/customer/register", { name: "Ahmed", phone: "12345", password: "secret123" }));
    expect(res.status).toBe(400);
  });

  it("refuses a password that is too short", async () => {
    session = null;
    const res = await register(jsonRequest("/api/customer/register", { name: "Ahmed", phone: "01055554444", password: "123" }));
    expect(res.status).toBe(400);
  });
});

describe("what a customer may book", () => {
  it("books, and the shop sees it as an online booking", async () => {
    const slots = await (await getCustomerSlots(getRequest(`/api/customer/slots?date=${day}&serviceIds=${shop.services.haircut}`))).json();
    const res = await book({ startAt: slots.anyBarber[4], serviceIds: [shop.services.haircut], notes: "Low fade" });
    expect(res.status).toBe(201);

    const stored = await testPrisma().appointment.findFirst({ include: { customer: true } });
    expect(stored?.source).toBe("ONLINE");
    expect(stored?.customerId).toBe(login.customerId);
    expect(stored?.barberId).toBeTruthy(); // "any barber" is resolved at once
  });

  it("is not offered a service the shop keeps off the app", async () => {
    const res = await getCustomerSlots(getRequest(`/api/customer/slots?date=${day}&serviceIds=${shop.services.protein}`));
    const body = await res.json();
    expect(body.anyBarber).toEqual([]);

    const attempt = await book({ startAt: at(day, 12 * 60).toISOString(), serviceIds: [shop.services.protein] });
    expect(attempt.status).toBe(400);
  });

  it("is not offered a barber the shop keeps off the app", async () => {
    await testPrisma().barber.update({ where: { id: shop.barbers.khaled }, data: { bookableOnline: false } });
    const { perBarber } = await (await getCustomerSlots(getRequest(`/api/customer/slots?date=${day}&serviceIds=${shop.services.haircut}`))).json();
    expect(perBarber.map((b: { barberName: string }) => b.barberName)).toEqual(["Abdullah"]);

    const attempt = await book({ barberId: shop.barbers.khaled, startAt: at(day, 12 * 60).toISOString(), serviceIds: [shop.services.haircut] });
    expect(attempt.status).toBe(400);
  });

  it("refuses a time inside the notice period", async () => {
    const res = await book({ startAt: new Date(Date.now() + 5 * 60_000).toISOString(), serviceIds: [shop.services.haircut] });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/too soon/i);
  });

  it("refuses a time beyond how far ahead the shop is open", async () => {
    const res = await book({ startAt: at(dayAhead(200), 12 * 60).toISOString(), serviceIds: [shop.services.haircut] });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/days ahead/i);
  });

  it("stops at three bookings waiting", async () => {
    const slots = await (await getCustomerSlots(getRequest(`/api/customer/slots?date=${day}&serviceIds=${shop.services.haircut}`))).json();
    for (let i = 0; i < 3; i++) {
      expect((await book({ startAt: slots.anyBarber[i * 4], serviceIds: [shop.services.haircut] })).status).toBe(201);
    }
    const fourth = await book({ startAt: slots.anyBarber[20], serviceIds: [shop.services.haircut] });
    expect(fourth.status).toBe(409);
    expect((await fourth.json()).error).toMatch(/already have 3/i);
  });

  it("cannot book while the shop has online booking switched off", async () => {
    const owner = session;
    session = staffSession(shop.owner.id);
    await saveSettings(jsonRequest("/api/booking/settings", { settings: { onlineBookingEnabled: false } }, "PUT"));
    session = owner;

    const res = await book({ startAt: at(day, 12 * 60).toISOString(), serviceIds: [shop.services.haircut] });
    expect(res.status).toBe(403);
    expect((await getCustomerSlots(getRequest(`/api/customer/slots?date=${day}&serviceIds=${shop.services.haircut}`))).status).toBe(403);
  });

  it("cannot take a slot the shop has already booked for someone else", async () => {
    const start = at(day, 12 * 60).toISOString();
    session = staffSession(shop.owner.id);
    await staffBook(jsonRequest("/api/appointments", { customerId: shop.customer.id, barberId: shop.barbers.abdullah, startAt: start, serviceIds: [shop.services.haircut] }));
    await staffBook(jsonRequest("/api/appointments", { customerId: shop.customer.id, barberId: shop.barbers.khaled, startAt: start, serviceIds: [shop.services.haircut] }));
    session = customerSession(login.id, login.customerId);

    const res = await book({ startAt: start, serviceIds: [shop.services.haircut] });
    expect(res.status).toBe(409);
  });
});

describe("a customer's own bookings", () => {
  const bookOne = async (minutes = 12 * 60) => {
    const res = await book({ startAt: at(day, minutes).toISOString(), serviceIds: [shop.services.haircut] });
    return res.json();
  };

  it("lists what is coming and what has been, and nobody else's", async () => {
    await bookOne();
    const other = await testPrisma().customer.create({ data: { name: "Another customer" } });
    await testPrisma().appointment.create({
      data: { customerId: other.id, barberId: shop.barbers.khaled, startAt: at(day, 13 * 60), endAt: at(day, 13 * 60 + 30), durationMinutes: 30, totalPrice: 150 },
    });

    const mine = await (await listMine(getRequest("/api/customer/appointments?scope=upcoming"))).json();
    expect(mine).toHaveLength(1);
    expect(clock(mine[0].startAt)).toBe("12:00");
  });

  it("cancels its own, and the chair is freed", async () => {
    const appointment = await bookOne();
    const res = await cancelMine(getRequest(`/api/customer/appointments/${appointment.id}`), { params: { id: appointment.id } });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("CANCELLED");

    const { anyBarber } = await (await getCustomerSlots(getRequest(`/api/customer/slots?date=${day}&serviceIds=${shop.services.haircut}`))).json();
    expect(anyBarber).toContain(at(day, 12 * 60).toISOString());
  });

  it("cannot touch somebody else's booking", async () => {
    const other = await testPrisma().customer.create({ data: { name: "Another customer" } });
    const theirs = await testPrisma().appointment.create({
      data: { customerId: other.id, barberId: shop.barbers.khaled, startAt: at(day, 13 * 60), endAt: at(day, 13 * 60 + 30), durationMinutes: 30, totalPrice: 150 },
    });

    const cancelled = await cancelMine(getRequest(`/api/customer/appointments/${theirs.id}`), { params: { id: theirs.id } });
    expect(cancelled.status).toBe(404);

    const moved = await moveMine(jsonRequest(`/api/customer/appointments/${theirs.id}`, { startAt: at(day, 16 * 60).toISOString() }, "PATCH"), {
      params: { id: theirs.id },
    });
    expect(moved.status).toBe(404);
    expect((await testPrisma().appointment.findUnique({ where: { id: theirs.id } }))?.status).toBe("CONFIRMED");
  });

  it("moves its own to another free time", async () => {
    const appointment = await bookOne();
    const res = await moveMine(jsonRequest(`/api/customer/appointments/${appointment.id}`, { startAt: at(day, 16 * 60).toISOString() }, "PATCH"), {
      params: { id: appointment.id },
    });
    expect(res.status).toBe(200);
    expect(clock((await res.json()).startAt)).toBe("16:00");
  });

  it("cannot cancel once it is too close to the appointment", async () => {
    // The window is two hours by default; this one is in one.
    const soon = new Date(Date.now() + 60 * 60_000);
    const appointment = await testPrisma().appointment.create({
      data: {
        customerId: login.customerId,
        barberId: shop.barbers.abdullah,
        startAt: soon,
        endAt: new Date(soon.getTime() + 30 * 60_000),
        durationMinutes: 30,
        totalPrice: 150,
      },
    });

    const res = await cancelMine(getRequest(`/api/customer/appointments/${appointment.id}`), { params: { id: appointment.id } });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/too late/i);
  });
});

describe("the profile", () => {
  it("reads back their details and their history", async () => {
    await testPrisma().visit.createMany({
      data: [1, 2].map(() => ({ customerId: login.customerId, total: 150, visitAt: new Date(), paymentMethod: "CASH" as const })),
    });
    const me = await (await getProfile()).json();
    expect(me.name).toBe("Ahmed Mohamed");
    expect(me.visitCount).toBe(2);
  });

  it("renames them in both places", async () => {
    const res = await updateProfile(jsonRequest("/api/customer/me", { name: "Ahmed M." }, "PATCH"));
    expect(res.status).toBe(200);
    expect((await testPrisma().customer.findUnique({ where: { id: login.customerId } }))?.name).toBe("Ahmed M.");
    expect((await testPrisma().user.findUnique({ where: { id: login.id } }))?.name).toBe("Ahmed M.");
  });

  it("keeps their picture, and gives it back", async () => {
    const picture = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ==";
    expect((await updateProfile(jsonRequest("/api/customer/me", { photo: picture }, "PATCH"))).status).toBe(200);
    expect((await (await getProfile()).json()).photo).toBe(picture);

    // And an empty string takes it off again.
    await updateProfile(jsonRequest("/api/customer/me", { photo: "" }, "PATCH"));
    expect((await (await getProfile()).json()).photo).toBeNull();
  });

  it("refuses something that is not a picture", async () => {
    const res = await updateProfile(jsonRequest("/api/customer/me", { photo: "https://example.com/me.jpg" }, "PATCH"));
    expect(res.status).toBe(400);
  });

  it("takes their birthday, and keeps only what it needs", async () => {
    expect((await updateProfile(jsonRequest("/api/customer/me", { birthday: "1994-09-18" }, "PATCH"))).status).toBe(200);
    const saved = await testPrisma().customer.findUniqueOrThrow({ where: { id: login.customerId } });
    expect(saved.birthday?.toISOString().slice(0, 10)).toBe("1994-09-18");

    // Clearing it is allowed: it was never required.
    await updateProfile(jsonRequest("/api/customer/me", { birthday: "" }, "PATCH"));
    expect((await testPrisma().customer.findUniqueOrThrow({ where: { id: login.customerId } })).birthday).toBeNull();
  });

  it("refuses a birthday in the future", async () => {
    const nextYear = new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10);
    expect((await updateProfile(jsonRequest("/api/customer/me", { birthday: nextYear }, "PATCH"))).status).toBe(400);
  });

  it("moves their login when they change their number", async () => {
    const res = await updateProfile(jsonRequest("/api/customer/me", { phone: "01277776666" }, "PATCH"));
    expect(res.status).toBe(200);
    expect((await testPrisma().user.findUniqueOrThrow({ where: { id: login.id } })).phone).toBe("01277776666");
    expect((await testPrisma().customer.findUniqueOrThrow({ where: { id: login.customerId } })).phone).toBe("01277776666");
  });

  it("saves a name on its own, without the number being re-examined", async () => {
    // The screen sends only what changed; this proves the server is happy with
    // that, which is what stopped a plain rename going through.
    const res = await updateProfile(jsonRequest("/api/customer/me", { name: "Ahmed Samir" }, "PATCH"));
    expect(res.status).toBe(200);
    expect((await (await getProfile()).json()).name).toBe("Ahmed Samir");
  });

  it("takes a number typed on an Arabic keyboard", async () => {
    const res = await updateProfile(jsonRequest("/api/customer/me", { phone: "٠١٢٧٧٧٧٦٦٦٦" }, "PATCH"));
    expect(res.status).toBe(200);
    expect((await testPrisma().user.findUniqueOrThrow({ where: { id: login.id } })).phone).toBe("01277776666");
  });

  it("says what a good number looks like when it refuses one", async () => {
    const res = await updateProfile(jsonRequest("/api/customer/me", { phone: "12345" }, "PATCH"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("010 1234 5678");
  });

  it("refuses a number that is not a mobile", async () => {
    expect((await updateProfile(jsonRequest("/api/customer/me", { phone: "12345" }, "PATCH"))).status).toBe(400);
  });

  it("refuses a number somebody else already signs in with", async () => {
    const other = await testPrisma().customer.create({ data: { name: "Somebody Else", phone: "01288885555" } });
    await seedCustomerLogin(other.id, "01288885555");

    const res = await updateProfile(jsonRequest("/api/customer/me", { phone: "01288885555" }, "PATCH"));
    expect(res.status).toBe(409);
    // Their own number is untouched.
    expect((await testPrisma().user.findUniqueOrThrow({ where: { id: login.id } })).phone).toBe("01099998888");
  });

  it("will not change the password without the current one", async () => {
    const res = await updateProfile(jsonRequest("/api/customer/me", { currentPassword: "wrong", newPassword: "newsecret" }, "PATCH"));
    expect(res.status).toBe(400);
  });

  it("changes the password when the current one is right", async () => {
    const before = (await testPrisma().user.findUnique({ where: { id: login.id } }))!.password;
    const res = await updateProfile(jsonRequest("/api/customer/me", { currentPassword: "customer-password", newPassword: "newsecret" }, "PATCH"));
    expect(res.status).toBe(200);
    const after = (await testPrisma().user.findUnique({ where: { id: login.id } }))!.password;
    expect(after).not.toBe(before);
  });
});

describe("the wall between customer and shop", () => {
  it("keeps staff out of the customer endpoints", async () => {
    session = staffSession(shop.owner.id);
    expect((await listMine(getRequest("/api/customer/appointments"))).status).toBe(401);
    expect((await getProfile()).status).toBe(401);
    expect((await getCustomerSlots(getRequest(`/api/customer/slots?date=${day}&serviceIds=${shop.services.haircut}`))).status).toBe(401);
  });

  it("keeps a signed-out visitor out", async () => {
    session = null;
    expect((await listMine(getRequest("/api/customer/appointments"))).status).toBe(401);
    expect((await book({ startAt: at(day, 12 * 60).toISOString(), serviceIds: [shop.services.haircut] })).status).toBe(401);
  });

  it("leaves the price list open, since it is what hangs on the wall", async () => {
    session = null;
    const res = await getCatalog();
    expect(res.status).toBe(200);
    const { services, barbers } = await res.json();
    expect(services.map((s: { name: string }) => s.name)).toEqual(["Beard cut", "Hair cut"]); // protein is not bookable online
    expect(barbers).toHaveLength(2);
  });
});
