import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getVapidKeys } from "@/lib/push";
import { pushSubscriptionSchema } from "@/lib/validations";

/**
 * A phone asking to be notified, and the key it needs to do so.
 *
 * Whoever is signed in gets their own row: a customer's phones are tied to
 * their customer record, a member of staff's to their login. Nobody can
 * subscribe on somebody else's behalf, because the identity comes from the
 * session rather than the request.
 */

export async function GET() {
  const keys = await getVapidKeys();
  if (!keys) return NextResponse.json({ error: "Notifications are not set up" }, { status: 503 });
  return NextResponse.json({ publicKey: keys.publicKey });
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const data = pushSubscriptionSchema.parse(await req.json());
    const owner =
      session.user.role === "CUSTOMER" && session.user.customerId
        ? { customerId: session.user.customerId, userId: null }
        : { customerId: null, userId: session.user.id };

    // One row per endpoint: re-subscribing on the same phone updates it rather
    // than piling up duplicates, and moves it to whoever is signed in now.
    const saved = await prisma.pushSubscription.upsert({
      where: { endpoint: data.endpoint },
      update: { p256dh: data.keys.p256dh, auth: data.keys.auth, ...owner },
      create: { endpoint: data.endpoint, p256dh: data.keys.p256dh, auth: data.keys.auth, ...owner },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, id: saved.id }, { status: 201 });
  } catch (err) {
    console.error("[push/subscribe]", err);
    return NextResponse.json({ error: "Could not turn notifications on" }, { status: 400 });
  }
}

/** Turning them off again: only your own device. */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const endpoint = req.nextUrl.searchParams.get("endpoint");
    if (!endpoint) return NextResponse.json({ error: "Which device?" }, { status: 400 });

    const mine =
      session.user.role === "CUSTOMER" && session.user.customerId
        ? { customerId: session.user.customerId }
        : { userId: session.user.id };

    await prisma.pushSubscription.deleteMany({ where: { endpoint, ...mine } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not turn notifications off" }, { status: 400 });
  }
}
