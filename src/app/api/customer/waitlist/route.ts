import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/auth";
import { getBookingSettings } from "@/lib/booking-server";
import { shopDateISO } from "@/lib/booking";
import { tidyWaitlist } from "@/lib/waitlist-server";
import { claimable } from "@/lib/waitlist";

/**
 * "Tell me if something opens."
 *
 * A customer who finds the day full joins the list rather than going elsewhere.
 * They can be on it for three days at once — enough to be useful, few enough
 * that the list stays a list rather than a wish.
 */

const MAX_ENTRIES = 3;

/** Where they stand, and any offer waiting to be taken. */
export async function GET() {
  try {
    const session = await requireCustomer();
    // Touching the list is as good a moment as any to tidy it.
    await tidyWaitlist();

    const entries = await prisma.waitlistEntry.findMany({
      where: { customerId: session.user.customerId, status: { in: ["WAITING", "OFFERED"] } },
      orderBy: { dateISO: "asc" },
      include: {
        barber: { select: { id: true, name: true, photo: true } },
        services: { include: { service: { select: { id: true, name: true, arabicName: true, defaultPrice: true } } } },
      },
    });

    const now = Date.now();
    return NextResponse.json(
      entries.map((entry) => ({
        id: entry.id,
        dateISO: entry.dateISO,
        barber: entry.barber,
        services: entry.services.map((line) => line.service),
        status: entry.status,
        offer: claimable({ ...entry, durationMinutes: 0 }, now)
          ? { startAt: entry.offeredStartAt, expiresAt: entry.offerExpiresAt }
          : null,
      }))
    );
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/** Join the list for a day. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireCustomer();
    const body = await req.json();

    const dateISO = String(body?.dateISO ?? "");
    const serviceIds: string[] = Array.isArray(body?.serviceIds) ? body.serviceIds.map(String) : [];
    const barberId = typeof body?.barberId === "string" && body.barberId ? body.barberId : null;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) {
      return NextResponse.json({ error: "Please choose a day" }, { status: 400 });
    }
    if (serviceIds.length === 0) {
      return NextResponse.json({ error: "Please choose what you want done" }, { status: 400 });
    }

    const settings = await getBookingSettings();
    if (dateISO < shopDateISO(Date.now(), settings.timezone)) {
      return NextResponse.json({ error: "That day has gone" }, { status: 400 });
    }

    // Everything they asked for must be something the shop offers online.
    const services = await prisma.service.findMany({
      where: { id: { in: serviceIds }, isActive: true, bookableOnline: true },
      select: { id: true },
    });
    if (services.length !== serviceIds.length) {
      return NextResponse.json({ error: "One of those cannot be booked online" }, { status: 400 });
    }

    const already = await prisma.waitlistEntry.findFirst({
      where: { customerId: session.user.customerId, dateISO, status: { in: ["WAITING", "OFFERED"] } },
      select: { id: true },
    });
    if (already) {
      return NextResponse.json({ error: "You are already on the list for that day" }, { status: 409 });
    }

    const waiting = await prisma.waitlistEntry.count({
      where: { customerId: session.user.customerId, status: { in: ["WAITING", "OFFERED"] } },
    });
    if (waiting >= MAX_ENTRIES) {
      return NextResponse.json({ error: `You can wait on ${MAX_ENTRIES} days at a time` }, { status: 409 });
    }

    const entry = await prisma.waitlistEntry.create({
      data: {
        customerId: session.user.customerId,
        dateISO,
        barberId,
        services: { create: serviceIds.map((serviceId) => ({ serviceId })) },
      },
      select: { id: true, dateISO: true, status: true },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[customer/waitlist]", err);
    return NextResponse.json({ error: "Could not join the list" }, { status: 400 });
  }
}

/** Come off the list. */
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireCustomer();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Which one?" }, { status: 400 });

    const gone = await prisma.waitlistEntry.updateMany({
      where: { id, customerId: session.user.customerId },
      data: { status: "CLOSED" },
    });
    if (gone.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
