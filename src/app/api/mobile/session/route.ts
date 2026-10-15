import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyCredentials } from "@/lib/auth";
import { bearerFrom, isMobileRole, issueMobileToken, sessionFromToken } from "@/lib/mobile-token";

/**
 * Signing in from the phone app: a phone number and a password in, a token out.
 * The app keeps the token in the phone's secure storage and sends it as
 * `Authorization: Bearer` on every call after.
 */

const signInSchema = z.object({
  phone: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const parsed = signInSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Please enter your number and password" }, { status: 400 });
  }

  const user = await verifyCredentials(parsed.data.phone, parsed.data.password);
  if (!user) {
    return NextResponse.json({ error: "That number and password do not match" }, { status: 401 });
  }
  // Right password, wrong app: the shop's own logins stay in the browser.
  if (!isMobileRole(user.role)) {
    return NextResponse.json({ error: "This login is for the shop's own screens" }, { status: 403 });
  }

  const token = await issueMobileToken(user);
  return NextResponse.json({ token, user: { id: user.id, name: user.name, role: user.role } });
}

/**
 * Renewing: a valid token in, a fresh one out. The app calls this when it opens,
 * so a customer who uses it at least once a month stays signed in up to the
 * same ninety-day cap a browser has.
 */
export async function GET(req: NextRequest) {
  const session = await sessionFromToken(bearerFrom(req.headers.get("authorization")));
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = await issueMobileToken(session.user, session.loginAt);
  return NextResponse.json({
    token,
    user: { id: session.user.id, name: session.user.name, role: session.user.role },
  });
}
