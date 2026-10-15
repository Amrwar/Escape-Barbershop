import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { customerSession, jsonRequest, seedCustomerLogin, seedShop, staffSession, type Shop } from "./fixtures";
import { DELETE as forget, POST as register } from "@/app/api/mobile/push/route";
import { sendPush } from "@/lib/push";

/**
 * Notifications to the phone app. A phone registers its Expo push token against
 * whoever is signed in, and every message the shop already sends a customer —
 * booking confirmed, reminder, a chair opening up — now reaches that phone too,
 * through Expo's push service. Expo itself is stubbed: what matters is who is
 * written to, and that a phone the app has left is forgotten.
 */

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("./db")).testPrisma() }));

let session: unknown = null;
vi.mock("next-auth", () => ({ getServerSession: async () => session }));

// No browser subscriptions in these tests, so web-push is never reached; this
// keeps it from trying to make real keys if it were.
vi.mock("web-push", () => ({
  default: { generateVAPIDKeys: () => ({ publicKey: "k", privateKey: "k" }), setVapidDetails: () => undefined, sendNotification: async () => ({}) },
}));

// Stand in for Expo, and remember what was sent.
let sentToExpo: { to: string; title: string; body: string; data: { url: string } }[] = [];
let expoAnswer: (to: string) => { status: "ok" | "error"; details?: { error: string } } = () => ({ status: "ok" });

const TOKEN = "ExponentPushToken[abc123]";
const OTHER = "ExponentPushToken[def456]";
const message = { title: "Booked", body: "See you Saturday at 2", url: "/app/appointments" };

let shop: Shop;
let login: { id: string; customerId: string };

beforeAll(() => startTestDatabase());

beforeEach(async () => {
  await resetDatabase();
  shop = await seedShop();
  login = await seedCustomerLogin(shop.customer.id);
  session = customerSession(login.id, login.customerId);
  sentToExpo = [];
  expoAnswer = () => ({ status: "ok" });
  vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
    const batch = JSON.parse(init.body) as typeof sentToExpo;
    sentToExpo.push(...batch);
    return new Response(JSON.stringify({ data: batch.map((m) => expoAnswer(m.to)) }), { status: 200 });
  });
});

afterEach(() => vi.unstubAllGlobals());

const add = (token: string, platform = "ios") => register(jsonRequest("/api/mobile/push", { token, platform }));
const remove = (token: string) =>
  forget(new NextRequest(`http://localhost/api/mobile/push?token=${encodeURIComponent(token)}`, { method: "DELETE" }));

describe("registering a phone", () => {
  it("ties the token to the customer who is signed in", async () => {
    expect((await add(TOKEN)).status).toBe(201);
    const row = await testPrisma().appPushToken.findUnique({ where: { token: TOKEN } });
    expect(row?.customerId).toBe(shop.customer.id);
    expect(row?.platform).toBe("ios");
  });

  it("does not pile up a phone that registers again", async () => {
    await add(TOKEN);
    await add(TOKEN);
    expect(await testPrisma().appPushToken.count()).toBe(1);
  });

  it("moves a phone to whoever signs in on it now", async () => {
    await add(TOKEN);
    const other = await testPrisma().customer.create({ data: { name: "Second Customer", phone: "01011112222" } });
    const otherLogin = await seedCustomerLogin(other.id, "01011112222");
    session = customerSession(otherLogin.id, other.id);
    await add(TOKEN);
    const row = await testPrisma().appPushToken.findUnique({ where: { token: TOKEN } });
    expect(row?.customerId).toBe(other.id);
  });

  it("refuses anything that is not an Expo push token", async () => {
    expect((await add("https://evil.example/collect")).status).toBe(400);
    expect(await testPrisma().appPushToken.count()).toBe(0);
  });

  it("refuses a visitor and a member of staff", async () => {
    session = null;
    expect((await add(TOKEN)).status).toBe(401);
    session = staffSession(shop.owner.id);
    expect((await add(TOKEN)).status).toBe(401);
  });

  it("forgets only the customer's own phone on sign-out", async () => {
    await add(TOKEN);
    const other = await testPrisma().customer.create({ data: { name: "Second Customer", phone: "01011112222" } });
    await testPrisma().appPushToken.create({ data: { token: OTHER, customerId: other.id } });

    await remove(OTHER);
    expect(await testPrisma().appPushToken.count()).toBe(2);
    await remove(TOKEN);
    expect(await testPrisma().appPushToken.findUnique({ where: { token: TOKEN } })).toBeNull();
  });
});

describe("sending to the phone", () => {
  it("delivers what the shop sends a customer, with where to open", async () => {
    await add(TOKEN);
    expect(await sendPush({ customerId: shop.customer.id }, message)).toBe(1);
    expect(sentToExpo).toEqual([
      expect.objectContaining({ to: TOKEN, title: "Booked", body: "See you Saturday at 2", data: { url: "/app/appointments" } }),
    ]);
  });

  it("writes to nobody else's phone", async () => {
    const other = await testPrisma().customer.create({ data: { name: "Second Customer", phone: "01011112222" } });
    await testPrisma().appPushToken.create({ data: { token: OTHER, customerId: other.id } });
    await sendPush({ customerId: shop.customer.id }, message);
    expect(sentToExpo).toEqual([]);
  });

  it("never writes to a phone for a member of staff's message", async () => {
    await add(TOKEN);
    await sendPush({ userId: shop.owner.id }, message);
    expect(sentToExpo).toEqual([]);
  });

  it("forgets a phone the app has left", async () => {
    await add(TOKEN);
    expoAnswer = () => ({ status: "error", details: { error: "DeviceNotRegistered" } });
    expect(await sendPush({ customerId: shop.customer.id }, message)).toBe(0);
    expect(await testPrisma().appPushToken.count()).toBe(0);
  });

  it("does not take anything down when Expo is unreachable", async () => {
    await add(TOKEN);
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    await expect(sendPush({ customerId: shop.customer.id }, message)).resolves.toBe(0);
    expect(await testPrisma().appPushToken.count()).toBe(1);
  });
});
