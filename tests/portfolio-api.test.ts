import bcrypt from "bcryptjs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { getRequest, jsonRequest, seedShop, staffSession, type Shop } from "./fixtures";
import { GET as myPhotos, POST as addPhoto, DELETE as removePhoto } from "@/app/api/barber/photos/route";
import { GET as publicProfile } from "@/app/api/customer/barbers/[id]/reviews/route";

/**
 * A barber's portfolio: their work, on their own profile.
 *
 * Theirs to add and theirs to remove, and nobody else's in either direction —
 * which is the only thing here that could really go wrong.
 */

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("./db")).testPrisma() }));

let session: unknown = null;
vi.mock("next-auth", () => ({ getServerSession: async () => session }));

let shop: Shop;
let abdullah: { id: string; barberId: string };

const PICTURE = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ==";

const barberSession = (userId: string, barberId: string) => ({
  user: { id: userId, email: "", name: "Barber", role: "BARBER", barberId },
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
      password: await bcrypt.hash("x", 4),
      role: "BARBER",
      barberId: shop.barbers.abdullah,
    },
  });
  abdullah = { id: user.id, barberId: shop.barbers.abdullah };
  session = barberSession(user.id, shop.barbers.abdullah);
});

const add = (image = PICTURE, caption?: string) =>
  addPhoto(jsonRequest("/api/barber/photos", { image, caption }));

describe("a barber's own work", () => {
  it("adds a photo and reads it back", async () => {
    expect((await add(PICTURE, "Skin fade")).status).toBe(201);

    const photos = await (await myPhotos()).json();
    expect(photos).toHaveLength(1);
    expect(photos[0].caption).toBe("Skin fade");
  });

  it("refuses something that is not a picture", async () => {
    expect((await add("https://example.com/cut.jpg")).status).toBe(400);
    expect(await testPrisma().barberPhoto.count()).toBe(0);
  });

  it("refuses a picture too big to be sensible", async () => {
    const huge = "data:image/jpeg;base64," + "A".repeat(400_001);
    expect((await add(huge)).status).toBe(400);
  });

  it("stops at twelve, because a wall of forty is not a portfolio", async () => {
    for (let i = 0; i < 12; i++) expect((await add()).status).toBe(201);
    expect((await add()).status).toBe(409);
    expect(await testPrisma().barberPhoto.count()).toBe(12);
  });

  it("removes their own", async () => {
    await add();
    const { id } = await testPrisma().barberPhoto.findFirstOrThrow();

    expect((await removePhoto(getRequest(`/api/barber/photos?id=${id}`))).status).toBe(200);
    expect(await testPrisma().barberPhoto.count()).toBe(0);
  });

  it("cannot touch another barber's work, in either direction", async () => {
    await add();
    const mine = await testPrisma().barberPhoto.findFirstOrThrow();

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

    // Cannot see it, and cannot remove it.
    expect(await (await myPhotos()).json()).toHaveLength(0);
    expect((await removePhoto(getRequest(`/api/barber/photos?id=${mine.id}`))).status).toBe(404);
    expect(await testPrisma().barberPhoto.count()).toBe(1);
  });

  it("is not the shop's screen to post on", async () => {
    session = staffSession(shop.owner.id);
    expect((await add()).status).toBe(401);
  });
});

describe("what a customer sees", () => {
  it("shows the work on the barber's profile", async () => {
    await add(PICTURE, "Skin fade");
    session = null;

    const body = await (
      await publicProfile(getRequest("/x"), { params: { id: shop.barbers.abdullah } })
    ).json();

    expect(body.photos).toHaveLength(1);
    expect(body.photos[0].caption).toBe("Skin fade");
  });

  it("shows none for a barber who has posted none", async () => {
    session = null;
    const body = await (
      await publicProfile(getRequest("/x"), { params: { id: shop.barbers.khaled } })
    ).json();
    expect(body.photos).toEqual([]);
  });

  it("goes with the barber when the shop hides them from the app", async () => {
    await add();
    await testPrisma().barber.update({ where: { id: abdullah.barberId }, data: { isActive: false } });
    session = null;

    const res = await publicProfile(getRequest("/x"), { params: { id: abdullah.barberId } });
    expect(res.status).toBe(404);
  });
});
