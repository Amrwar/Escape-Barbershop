import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { jsonRequest, seedShop, staffSession, type Shop } from "./fixtures";
import { POST as addUser, GET as listUsers } from "@/app/api/users/route";
import { PATCH as updateUser } from "@/app/api/users/[id]/route";
import { authOptions } from "@/lib/auth";

/**
 * A login a barber can actually perform.
 *
 * Twenty-six barbers have no work email address, so a login that demands one is
 * a login nobody has. They sign in with the phone in their hand and a PIN; the
 * office keeps email and password. Both end up in the same row, and the rule is
 * that a login has exactly one way in.
 */

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("./db")).testPrisma() }));

let session: unknown = null;
vi.mock("next-auth", () => ({ getServerSession: async () => session }));

type Credentials = Record<"email" | "password", string>;
type Authorize = (c: Credentials | undefined, req: unknown) => Promise<{ id: string; role: string; barberId?: string } | null>;
const provider = authOptions.providers[0] as unknown as { options?: { authorize: Authorize }; authorize: Authorize };
const authorize = provider.options?.authorize ?? provider.authorize;
const signIn = (identifier: string, password: string) => authorize({ email: identifier, password }, {});

let shop: Shop;

beforeAll(() => startTestDatabase());

beforeEach(async () => {
  await resetDatabase();
  shop = await seedShop();
  session = staffSession(shop.owner.id);
});

const add = (body: Record<string, unknown>) => addUser(jsonRequest("/api/users", body));

const barberLogin = (over: Record<string, unknown> = {}) =>
  add({ name: "Abdullah", phone: "01012345678", password: "482913", role: "BARBER", barberId: shop.barbers.abdullah, ...over });

describe("giving a barber a login", () => {
  it("takes a phone and a PIN, and no email at all", async () => {
    expect((await barberLogin()).status).toBe(201);

    const user = await testPrisma().user.findFirst({ where: { role: "BARBER" } });
    expect(user!.phone).toBe("01012345678");
    expect(user!.email).toBeNull();
    expect(user!.barberId).toBe(shop.barbers.abdullah);
  });

  it("stores the PIN hashed, never as typed", async () => {
    await barberLogin();
    const user = await testPrisma().user.findFirst({ where: { role: "BARBER" } });
    expect(user!.password).not.toBe("482913");
    expect(user!.password.startsWith("$2")).toBe(true);
  });

  it("signs them in with that phone and PIN", async () => {
    await barberLogin();
    const who = await signIn("01012345678", "482913");

    expect(who?.role).toBe("BARBER");
    expect(who?.barberId).toBe(shop.barbers.abdullah);
  });

  it("takes the number however they type it", async () => {
    await barberLogin();
    expect((await signIn("+20 101 234 5678", "482913"))?.role).toBe("BARBER");
    expect((await signIn("٠١٠١٢٣٤٥٦٧٨", "482913"))?.role).toBe("BARBER");
  });

  it("refuses the wrong PIN", async () => {
    await barberLogin();
    expect(await signIn("01012345678", "482914")).toBeNull();
  });

  it("insists on six digits, because four is a thousand guesses", async () => {
    expect((await barberLogin({ password: "4829" })).status).toBe(400);
    expect((await barberLogin({ password: "48291" })).status).toBe(400);
    expect((await barberLogin({ password: "482913" })).status).toBe(201);
  });

  it("will not take letters in a PIN", async () => {
    expect((await barberLogin({ password: "abcdef" })).status).toBe(400);
  });

  it("wants to know which barber it belongs to", async () => {
    expect((await barberLogin({ barberId: undefined })).status).toBe(400);
  });

  it("refuses a number that is not an Egyptian mobile", async () => {
    expect((await barberLogin({ phone: "12345" })).status).toBe(400);
    expect(await testPrisma().user.count({ where: { role: "BARBER" } })).toBe(0);
  });

  it("will not give the same number two logins", async () => {
    expect((await barberLogin()).status).toBe(201);
    const second = await barberLogin({ barberId: shop.barbers.khaled });

    expect(second.status).toBe(409);
    expect((await second.json()).error).toBe("phone_exists");
  });
});

describe("a login has exactly one way in", () => {
  it("refuses both an email and a phone", async () => {
    const res = await add({
      name: "Abdullah",
      email: "abdullah@escape.test",
      phone: "01012345678",
      password: "482913",
      role: "BARBER",
      barberId: shop.barbers.abdullah,
    });
    expect(res.status).toBe(400);
  });

  it("refuses neither", async () => {
    expect((await add({ name: "Nobody", password: "a-long-password", role: "CASHIER" })).status).toBe(400);
  });

  it("still holds the office to a real password, not a PIN", async () => {
    expect(
      (await add({ name: "Till", email: "till@escape.test", password: "482913", role: "CASHIER" })).status
    ).toBe(400);
    expect(
      (await add({ name: "Till", email: "till@escape.test", password: "a-long-password", role: "CASHIER" })).status
    ).toBe(201);
  });
});

describe("the owner's list of logins", () => {
  it("shows whichever way in each account has", async () => {
    await barberLogin();
    const users = await (await listUsers()).json();

    const barber = users.find((u: { role: string }) => u.role === "BARBER");
    const owner = users.find((u: { role: string }) => u.role === "OWNER");
    expect(barber.phone).toBe("01012345678");
    expect(barber.email).toBeNull();
    expect(owner.email).toBe("owner@escape.test");
  });

  it("never sends the hash out with them", async () => {
    await barberLogin();
    const users = await (await listUsers()).json();
    expect(JSON.stringify(users)).not.toContain("$2");
  });
});

describe("resetting a barber's PIN", () => {
  it("takes a new six-digit PIN and signs them in with it", async () => {
    await barberLogin();
    const user = await testPrisma().user.findFirst({ where: { role: "BARBER" } });

    const res = await updateUser(jsonRequest(`/api/users/${user!.id}`, { password: "770011" }, "PATCH"), {
      params: { id: user!.id },
    });
    expect(res.status).toBe(200);

    expect(await signIn("01012345678", "482913")).toBeNull();
    expect((await signIn("01012345678", "770011"))?.role).toBe("BARBER");
  });

  it("refuses a PIN that is too short to be one", async () => {
    await barberLogin();
    const user = await testPrisma().user.findFirst({ where: { role: "BARBER" } });

    const res = await updateUser(jsonRequest(`/api/users/${user!.id}`, { password: "1234" }, "PATCH"), {
      params: { id: user!.id },
    });
    expect(res.status).toBe(400);
  });
});
