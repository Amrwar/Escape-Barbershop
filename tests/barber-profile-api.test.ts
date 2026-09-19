import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { getRequest, jsonRequest, seedShop, staffSession, type Shop } from "./fixtures";
import { GET as listBarbers, POST as addBarber } from "@/app/api/barbers/route";
import { PATCH as updateBarber } from "@/app/api/barbers/[id]/route";
import { GET as catalog } from "@/app/api/customer/catalog/route";

/**
 * A barber's face and the line about them.
 *
 * `photo` has been on the record and read by the customer app, the booking flow
 * and the roster since each was built, with nothing anywhere to set one — so
 * every barber showed as initials in a grey circle. And creating a barber threw
 * away the bio and the "takes bookings in the app" switch that the form had
 * just sent.
 */

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("./db")).testPrisma() }));

let session: unknown = null;
vi.mock("next-auth", () => ({ getServerSession: async () => session }));

let shop: Shop;

const PICTURE = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ==";

beforeAll(() => startTestDatabase());

beforeEach(async () => {
  await resetDatabase();
  shop = await seedShop();
  session = staffSession(shop.owner.id);
});

const patch = (id: string, body: Record<string, unknown>) =>
  updateBarber(jsonRequest(`/api/barbers/${id}`, body, "PATCH"), { params: { id } });

describe("giving a barber a face", () => {
  it("saves a picture and gives it back", async () => {
    const res = await patch(shop.barbers.abdullah, { photo: PICTURE });
    expect(res.status).toBe(200);

    const barber = await testPrisma().barber.findUnique({ where: { id: shop.barbers.abdullah } });
    expect(barber!.photo).toBe(PICTURE);
  });

  it("takes it down again when the picture is cleared", async () => {
    await patch(shop.barbers.abdullah, { photo: PICTURE });
    await patch(shop.barbers.abdullah, { photo: "" });

    const barber = await testPrisma().barber.findUnique({ where: { id: shop.barbers.abdullah } });
    expect(barber!.photo).toBeNull();
  });

  it("leaves the picture alone when the edit is about something else", async () => {
    await patch(shop.barbers.abdullah, { photo: PICTURE });
    await patch(shop.barbers.abdullah, { bio: "Fades and beards" });

    const barber = await testPrisma().barber.findUnique({ where: { id: shop.barbers.abdullah } });
    expect(barber!.photo).toBe(PICTURE);
    expect(barber!.bio).toBe("Fades and beards");
  });

  it("refuses something that is not a picture", async () => {
    expect((await patch(shop.barbers.abdullah, { photo: "https://example.com/face.jpg" })).status).toBe(400);
    expect((await patch(shop.barbers.abdullah, { photo: "not a picture" })).status).toBe(400);
  });

  it("refuses one too big to ride along with the catalogue", async () => {
    const huge = `data:image/jpeg;base64,${"A".repeat(400_001)}`;
    expect((await patch(shop.barbers.abdullah, { photo: huge })).status).toBe(400);
  });

  it("is the owner's to set, not a cashier's", async () => {
    session = staffSession(shop.cashier.id, "CASHIER");
    expect((await patch(shop.barbers.abdullah, { photo: PICTURE })).status).toBe(401);
  });
});

describe("adding a barber", () => {
  it("keeps the bio and the booking switch the form sent", async () => {
    const res = await addBarber(
      jsonRequest("/api/barbers", {
        name: "Mahmoud",
        bio: "Twelve years on skin fades",
        bookableOnline: false,
        photo: PICTURE,
      })
    );
    expect(res.status).toBe(201);

    const barber = await testPrisma().barber.findFirst({ where: { name: "Mahmoud" } });
    expect(barber!.bio).toBe("Twelve years on skin fades");
    expect(barber!.bookableOnline).toBe(false);
    expect(barber!.photo).toBe(PICTURE);
  });

  it("still takes bookings by default when nothing says otherwise", async () => {
    await addBarber(jsonRequest("/api/barbers", { name: "Sayed" }));

    const barber = await testPrisma().barber.findFirst({ where: { name: "Sayed" } });
    expect(barber!.bookableOnline).toBe(true);
    expect(barber!.bio).toBeNull();
    expect(barber!.photo).toBeNull();
  });
});

describe("what the customer app sees", () => {
  it("carries the picture through to the catalogue everyone loads", async () => {
    await patch(shop.barbers.abdullah, { photo: PICTURE, bio: "Fades and beards" });

    session = null;
    const { barbers } = await (await catalog(getRequest("/api/customer/catalog"))).json();
    const abdullah = barbers.find((b: { id: string }) => b.id === shop.barbers.abdullah);

    expect(abdullah.photo).toBe(PICTURE);
    expect(abdullah.bio).toBe("Fades and beards");
  });

  it("shows initials rather than a broken picture for anyone without one", async () => {
    session = null;
    const { barbers } = await (await catalog(getRequest("/api/customer/catalog"))).json();
    expect(barbers.every((b: { photo: string | null }) => b.photo === null)).toBe(true);
  });

  it("returns the owner's list with each photo, so it is obvious who lacks one", async () => {
    await patch(shop.barbers.abdullah, { photo: PICTURE });

    session = staffSession(shop.owner.id);
    const rows = await (await listBarbers(getRequest("/api/barbers"))).json();
    const withPhoto = rows.filter((b: { photo: string | null }) => b.photo);
    expect(withPhoto).toHaveLength(1);
  });
});
