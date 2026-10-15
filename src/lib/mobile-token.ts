import { decode, encode } from "next-auth/jwt";
import type { Session } from "next-auth";
import { isPastMaxSession, tokenLifetimeSeconds } from "./session-policy";

/**
 * The phone app's way in.
 *
 * A browser carries its login in a cookie; the phone app has no cookie jar it
 * can rely on, so it carries the same signed token in an `Authorization:
 * Bearer` header instead. It is the very token NextAuth would have put in the
 * cookie — same secret, same expiry rules — so every `requireCustomer()` route
 * accepts it without knowing the difference.
 *
 * Only a customer can hold one. A shop login lives on a shared counter device
 * and expires in half an hour; nothing about that belongs in a token kept on
 * somebody's phone.
 */

export const MOBILE_ROLES = ["CUSTOMER"] as const;

export function isMobileRole(role: unknown): boolean {
  return (MOBILE_ROLES as readonly unknown[]).includes(role);
}

export interface MobileUser {
  id: string;
  name: string;
  role: string;
  customerId?: string | null;
  barberId?: string | null;
}

function secret(): string {
  const value = process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error("NEXTAUTH_SECRET is not set");
  return value;
}

/**
 * A token for this user. `loginAt` carries over when an existing token is
 * renewed, so renewing slides the idle window but never the hard cap.
 */
export async function issueMobileToken(user: MobileUser, loginAt = Date.now(), now = Date.now()): Promise<string> {
  if (!isMobileRole(user.role)) throw new Error("This login cannot be used from the phone app");
  return encode({
    secret: secret(),
    maxAge: tokenLifetimeSeconds(loginAt, now, user.role),
    token: {
      sub: user.id,
      name: user.name,
      role: user.role,
      customerId: user.customerId ?? undefined,
      barberId: user.barberId ?? undefined,
      loginAt,
    },
  });
}

/** The raw token out of an `Authorization` header, if it holds one. */
export function bearerFrom(header: string | null | undefined): string | null {
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

/**
 * The session a bearer token stands for, shaped exactly as NextAuth's own, or
 * null for anything forged, expired, past its cap, or not a customer's.
 */
export async function sessionFromToken(raw: string | null, now = Date.now()): Promise<Session | null> {
  if (!raw) return null;
  let token;
  try {
    token = await decode({ token: raw, secret: secret() });
  } catch {
    return null;
  }
  if (!token?.sub || !isMobileRole(token.role)) return null;
  if (isPastMaxSession(token.loginAt, now, token.role)) return null;

  const exp = typeof token.exp === "number" ? token.exp * 1000 : now;
  return {
    user: {
      id: token.sub,
      name: token.name ?? "",
      email: "",
      role: token.role,
      customerId: token.customerId,
      barberId: token.barberId,
    },
    loginAt: token.loginAt,
    expires: new Date(exp).toISOString(),
  };
}
