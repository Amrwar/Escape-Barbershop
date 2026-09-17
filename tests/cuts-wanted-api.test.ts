import bcrypt from "bcryptjs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import {
  at,
  customerSession,
  dayAhead,
  getRequest,
  jsonRequest,
  seedCustomerLogin,
  seedShop,
  type Shop,
} from "./fixtures";
import {
  GET as myWanted,
  POST as addWanted,
  DELETE as removeWanted,
} from "@/app/api/customer/cuts-wanted/route";
import { GET as barberDay } from "@/app/api/barber/today/route";

/**
 * "The cut I want": a customer keeps a few pictures on their own record, and the
 * barber sees them the moment that customer is in the chair.
 *
 * Theirs to add and theirs to remove — the shop sees them, which is the point,
 * but nobody adds one on somebody else's behalf and nobody removes another
 * customer's.
 */

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("./db")).testPrisma() }));

let session: unknown = null;
vi.mock("next-auth", () => ({ getServerSession: async () => session }));

let shop: Shop;
let login: { id: string; customerId: string };

const PICTURE = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ==";

beforeAll(() => startTestDatabase());

beforeEach(async () => {
  await resetDatabase();
  shop = await seedShop();
  login = await seedCustomerLogin(shop.customer.id);
  session = customerSession(login.id, login.customerId);
});

const add = (image = PICTURE, note?: string) =>
  addWanted(jsonRequest("/api/customer/cuts-wanted", { image, note }));

const listMine = async () => (await myWanted()).json();

describe("keeping a picture of the cut you want", () => {
  it("adds one and reads it back", async () => {
    expect((await add(PICTURE, "Short on the sides")).status).toBe(201);

    const photos = await listMine();
    expect(photos).toHaveLength(1);
    expect(photos[0].note).toBe("Short on the sides");
    expect(photos[0].image).toBe(PICTURE);
  });

  it("takes a picture without a word attached", async () => {
    expect((await add(PICTURE)).status).toBe(201);
    expect((await listMine())[0].note).toBeNull();
  });

  it("refuses anything that is not a picture", async () => {
    expect((await add("https://example.com/a-cut.jpg")).status).toBe(400);
    expect((await add("not a picture at all")).status).toBe(400);
    expect(await testPrisma().cutWanted.count()).toBe(0);
  });

  it("refuses one too big to be worth storing", async () => {
    const huge = `data:image/jpeg;base64,${"A".repeat(400_001)}`;
    expect((await add(huge)).status).toBe(400);
    expect(await testPrisma().cutWanted.count()).toBe(0);
  });

  it("stops at six, because past that it is a mood board", async () => {
    for (let i = 0; i < 6; i++) expect((await add()).status).toBe(201);

    expect((await add()).status).toBe(409);
    expect(await testPrisma().cutWanted.count()).toBe(6);
  });

  it("keeps the newest first, which is the one they mean", async () => {
    await add(PICTURE, "Old idea");
    await add(PICTURE, "What I want now");

    expect((await listMine())[0].note).toBe("What I want now");
  });

  it("is nobody's business but the customer signed in", async () => {
    session = null;
    expect((await myWanted()).status).toBe(401);
    expect((await add()).status).toBe(401);
  });
});

describe("removing one", () => {
  it("removes their own", async () => {
    await add(PICTURE, "Changed my mind");
    const [photo] = await listMine();

    const res = await removeWanted(jsonRequest(`/api/customer/cuts-wanted?id=${photo.id}`, undefined, "DELETE"));
    expect(res.status).toBe(200);
    expect(await testPrisma().cutWanted.count()).toBe(0);
  });

  it("will not remove somebody else's", async () => {
    await add(PICTURE, "Mine");
    const [photo] = await listMine();

    const other = await testPrisma().customer.create({ data: { name: "Mahmoud", phone: "01088887777" } });
    const otherLogin = await seedCustomerLogin(other.id, "01088887777");
    session = customerSession(otherLogin.id, otherLogin.customerId);

    const res = await removeWanted(jsonRequest(`/api/customer/cuts-wanted?id=${photo.id}`, undefined, "DELETE"));
    expect(res.status).toBe(404);
    expect(await testPrisma().cutWanted.count()).toBe(1);
  });

  it("wants to know which one", async () => {
    expect((await removeWanted(jsonRequest("/api/customer/cuts-wanted", undefined, "DELETE"))).status).toBe(400);
  });
});

describe("what the barber sees", () => {
  it("carries the pictures onto the barber's own day screen", async () => {
    await add(PICTURE, "Skin fade, low");

    const day = dayAhead(0);
    await testPrisma().appointment.create({
      data: {
        customerId: shop.customer.id,
        barberId: shop.barbers.abdullah,
        startAt: at(day, 12 * 60),
        endAt: at(day, 12 * 60 + 30),
        durationMinutes: 30,
        totalPrice: 150,
        status: "CONFIRMED",
        services: {
          create: [{ serviceId: shop.services.haircut, serviceName: "Hair cut", price: 150, durationMinutes: 30 }],
        },
      },
    });

    const user = await testPrisma().user.create({
      data: {
        name: "Abdullah",
        email: "abdullah@escape.test",
        password: await bcrypt.hash("x", 4),
        role: "BARBER",
        barberId: shop.barbers.abdullah,
      },
    });
    session = { user: { id: user.id, email: "", name: "Abdullah", role: "BARBER", barberId: shop.barbers.abdullah }, loginAt: Date.now(), expires: "" };

    // The day is pinned in the query, so a test running across Cairo midnight
    // still asks for the day it wrote the appointment into.
    const today = await (await barberDay(getRequest(`/api/barber/today?date=${day}`))).json();
    const wanted = today.appointments?.[0]?.customer?.cutsWanted;

    expect(wanted).toHaveLength(1);
    expect(wanted[0].note).toBe("Skin fade, low");
  });
});
