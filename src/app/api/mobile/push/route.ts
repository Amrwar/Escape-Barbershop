import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/auth";
import { isExpoPushToken } from "@/lib/app-push";

/**
 * The phone app saying "tell me here": its Expo push token, tied to whoever is
 * signed in. The identity comes from the login, never the request, so nobody
 * can put their phone on somebody else's record.
 */

const deviceSchema = z.object({
  token: z.string().refine(isExpoPushToken, "That is not a push token"),
  platform: z.enum(["ios", "android", "web"]).optional(),
});

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireCustomer();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = deviceSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Which device?" }, { status: 400 });

  // One row per install: registering again updates it, and a phone handed to
  // somebody else moves to whoever signs in on it now.
  await prisma.appPushToken.upsert({
    where: { token: parsed.data.token },
    update: { customerId: session.user.customerId, platform: parsed.data.platform ?? null },
    create: { token: parsed.data.token, customerId: session.user.customerId, platform: parsed.data.platform ?? null },
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}

/** Signing out: this phone stops hearing about this customer. Only their own. */
export async function DELETE(req: NextRequest) {
  let session;
  try {
    session = await requireCustomer();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Which device?" }, { status: 400 });

  await prisma.appPushToken.deleteMany({ where: { token, customerId: session.user.customerId } });
  return NextResponse.json({ ok: true });
}
