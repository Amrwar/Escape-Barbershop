import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase } from "./db";
import { seedCustomerLogin, seedShop, type Shop } from "./fixtures";
import { authOptions } from "@/lib/auth";
import { MAX_SESSION_MS, IDLE_TIMEOUT_MS, CUSTOMER_IDLE_TIMEOUT_MS, isPastMaxSession, tokenLifetimeSeconds } from "@/lib/session-policy";

/**
 * Signing in, and how long a login lasts. Staff sign in with an email, customers
 * with their phone number, and the two get very different session lengths: a
 * shop device on a counter expires, a customer's own phone does not.
 */

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("./db")).testPrisma() }));
vi.mock("next-auth", () => ({ getServerSession: async () => null }));


type Credentials = Record<"email" | "password", string>;
type Authorize = (credentials: Credentials | undefined, req: unknown) => Promise<{ id: string; role: string; customerId?: string } | null>;

// NextAuth keeps what was passed to CredentialsProvider under `options`; the
// `authorize` sitting on the provider itself is a stub that always returns null.
const provider = authOptions.providers[0] as unknown as { options?: { authorize: Authorize }; authorize: Authorize };
const authorize = provider.options?.authorize ?? provider.authorize;
const signIn = (identifier: string, password: string) => authorize({ email: identifier, password }, {});

let shop: Shop;

beforeAll(() => startTestDatabase());

beforeEach(async () => {
  await resetDatabase();
  shop = await seedShop();
  await seedCustomerLogin(shop.customer.id);
});

describe("signing in", () => {
  it("lets a member of staff in with their email", async () => {
    const user = await signIn("owner@escape.test", "test-password");
    expect(user?.role).toBe("OWNER");
  });

  it("lets a customer in with their phone number, however they type it", async () => {
    for (const typed of ["01099998888", "010 9999 8888", "+2001099998888", "0020 1099998888"]) {
      const user = await signIn(typed, "customer-password");
      expect(user?.role, `signing in with "${typed}"`).toBe("CUSTOMER");
      expect(user?.customerId).toBe(shop.customer.id);
    }
  });

  it("refuses the wrong password", async () => {
    expect(await signIn("owner@escape.test", "not-the-password")).toBeNull();
    expect(await signIn("01099998888", "not-the-password")).toBeNull();
  });

  it("refuses an unknown email or number", async () => {
    expect(await signIn("nobody@escape.test", "test-password")).toBeNull();
    expect(await signIn("01000000000", "customer-password")).toBeNull();
  });

  it("refuses an empty password", async () => {
    expect(await signIn("owner@escape.test", "")).toBeNull();
  });

  it("does not let a phone number sign in as staff by looking like an email", async () => {
    expect(await signIn("01099998888@escape.test", "customer-password")).toBeNull();
  });
});

describe("how long a login lasts", () => {
  const hours = (n: number) => n * 60 * 60 * 1000;

  it("ends a shop login two hours after it started", () => {
    const start = Date.now();
    expect(isPastMaxSession(start, start + hours(1), "CASHIER")).toBe(false);
    expect(isPastMaxSession(start, start + hours(2), "CASHIER")).toBe(true);
  });

  it("leaves a customer signed in for far longer", () => {
    const start = Date.now();
    expect(isPastMaxSession(start, start + hours(48), "CUSTOMER")).toBe(false);
  });

  it("gives a shop token the idle window, and a customer token a month", () => {
    const now = Date.now();
    expect(tokenLifetimeSeconds(now, now, "OWNER")).toBe(IDLE_TIMEOUT_MS / 1000);
    expect(tokenLifetimeSeconds(now, now, "CUSTOMER")).toBe(CUSTOMER_IDLE_TIMEOUT_MS / 1000);
  });

  it("shortens a shop token so it never outlives the two-hour cap", () => {
    const start = Date.now();
    const almostUp = start + MAX_SESSION_MS - 5 * 60 * 1000;
    expect(tokenLifetimeSeconds(start, almostUp, "OWNER")).toBe(5 * 60);
  });

  it("ends a token from before logins carried a start time, whoever it belongs to", () => {
    expect(isPastMaxSession(undefined, Date.now(), "OWNER")).toBe(true);
    expect(isPastMaxSession(undefined, Date.now(), "CUSTOMER")).toBe(true);
    expect(tokenLifetimeSeconds(undefined, Date.now(), "CUSTOMER")).toBe(0);
  });
});

describe("what the session carries", () => {
  it("puts the role and the customer's own id into the token, and back out again", async () => {
    const user = await signIn("01099998888", "customer-password");
    const jwt = authOptions.callbacks!.jwt!;
    const sessionCallback = authOptions.callbacks!.session!;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const token = (await jwt({ token: {}, user: user as any } as any)) as Record<string, unknown>;
    expect(token.role).toBe("CUSTOMER");
    expect(token.customerId).toBe(shop.customer.id);
    expect(typeof token.loginAt).toBe("number");

    const session = (await sessionCallback({
      session: { user: { id: "", email: "", name: "", role: "" } },
      token,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)) as { user: { role: string; customerId?: string } };
    expect(session.user.role).toBe("CUSTOMER");
    expect(session.user.customerId).toBe(shop.customer.id);
  });

  it("throws away a token that has reached its cap, rather than passing it on", async () => {
    const jwt = authOptions.callbacks!.jwt!;
    const expired = { role: "OWNER", loginAt: Date.now() - MAX_SESSION_MS - 1000 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(jwt({ token: expired } as any)).rejects.toThrow(/maximum length/i);
  });
});
