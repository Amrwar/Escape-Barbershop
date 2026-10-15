import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { encode } from "next-auth/jwt";
import { NextRequest } from "next/server";
import { resetDatabase, startTestDatabase } from "./db";
import { jsonRequest, seedCustomerLogin, seedShop, type Shop } from "./fixtures";
import { GET as renew, POST as signIn } from "@/app/api/mobile/session/route";
import { GET as me } from "@/app/api/customer/me/route";
import { CUSTOMER_MAX_SESSION_MS } from "@/lib/session-policy";

/**
 * The phone app's way in. It has no cookie, so it signs in for a token and
 * sends it as `Authorization: Bearer` — and every customer route must take that
 * token exactly as it takes the browser's cookie, and refuse everything else.
 */

process.env.NEXTAUTH_SECRET = "test-secret-for-the-phone-app";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("./db")).testPrisma() }));
// No browser here: the cookie session is always missing, so only the bearer counts.
vi.mock("next-auth", () => ({ getServerSession: async () => null }));

let authorization: string | null = null;
vi.mock("next/headers", () => ({ headers: () => new Headers(authorization ? { authorization } : {}) }));

let shop: Shop;

beforeAll(() => startTestDatabase());

beforeEach(async () => {
  await resetDatabase();
  shop = await seedShop();
  await seedCustomerLogin(shop.customer.id);
  authorization = null;
});

const login = (phone: string, password: string) => signIn(jsonRequest("/api/mobile/session", { phone, password }));

const renewWith = (token: string) =>
  renew(new NextRequest("http://localhost/api/mobile/session", { headers: { authorization: `Bearer ${token}` } }));

async function tokenFor(phone = "010 9999 8888", password = "customer-password") {
  const res = await login(phone, password);
  return (await res.json()).token as string;
}

describe("signing in from the phone app", () => {
  it("gives a customer a token for their number and password", async () => {
    const res = await login("010 9999 8888", "customer-password");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.token).toBe("string");
    expect(body.user.role).toBe("CUSTOMER");
  });

  it("refuses the wrong password, and says nothing about whether the number exists", async () => {
    const wrong = await login("01099998888", "nope");
    const unknown = await login("01000000000", "customer-password");
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect((await wrong.json()).error).toBe((await unknown.json()).error);
  });

  it("refuses a shop login even with the right password", async () => {
    const res = await login("owner@escape.test", "test-password");
    expect(res.status).toBe(403);
  });

  it("asks for both fields", async () => {
    expect((await signIn(jsonRequest("/api/mobile/session", { phone: "01099998888" }))).status).toBe(400);
  });
});

describe("using the token", () => {
  it("opens the customer's own routes, as the cookie would", async () => {
    authorization = `Bearer ${await tokenFor()}`;
    const res = await me();
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(shop.customer.id);
  });

  it("opens nothing without one", async () => {
    expect((await me()).status).toBe(401);
  });

  it("opens nothing with a forged one", async () => {
    const forged = await encode({
      secret: "somebody-elses-secret",
      token: { sub: "x", role: "CUSTOMER", customerId: shop.customer.id, loginAt: Date.now() },
    });
    authorization = `Bearer ${forged}`;
    expect((await me()).status).toBe(401);
  });

  it("does not let a staff token in through this door", async () => {
    const staff = await encode({
      secret: process.env.NEXTAUTH_SECRET!,
      token: { sub: shop.owner.id, role: "OWNER", loginAt: Date.now() },
    });
    authorization = `Bearer ${staff}`;
    expect((await me()).status).toBe(401);
  });

  it("stops working once the login reaches its ninety-day cap", async () => {
    const old = await encode({
      secret: process.env.NEXTAUTH_SECRET!,
      token: { sub: "x", role: "CUSTOMER", customerId: shop.customer.id, loginAt: Date.now() - CUSTOMER_MAX_SESSION_MS },
    });
    authorization = `Bearer ${old}`;
    expect((await me()).status).toBe(401);
  });
});

describe("renewing", () => {
  it("swaps a valid token for a fresh one that still works", async () => {
    const res = await renewWith(await tokenFor());
    expect(res.status).toBe(200);
    authorization = `Bearer ${(await res.json()).token}`;
    expect((await me()).status).toBe(200);
  });

  it("refuses to renew a token that is not valid", async () => {
    expect((await renewWith("not-a-token")).status).toBe(401);
  });
});
