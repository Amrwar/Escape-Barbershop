import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { getBookingSettings } from "@/lib/booking-server";
import { shopDateISO, shopTime } from "@/lib/booking";
import { estimateWaits } from "@/lib/queue";
import { isRunning } from "@/lib/offers";

/**
 * What goes on the screen on the wall.
 *
 * Deliberately not the queue endpoint the staff screens use. This one faces the
 * room: everybody waiting can read it, and so can anybody who walks past the
 * window. So it carries **first names only** — which is what a barber calls out
 * anyway — and no phone numbers, no prices against a person, no notes.
 *
 * It still needs a signed-in device, because the shop's own day is nobody
 * else's business; the television is signed in once and left alone.
 */
export const dynamic = "force-dynamic";

/** "Ahmed Mohamed Samir" reads out as "Ahmed". */
const firstName = (name: string) => name.trim().split(/\s+/)[0] || "—";

export async function GET() {
  try {
    await requireAuth();
    const settings = await getBookingSettings();

    const today = shopDateISO(Date.now(), settings.timezone);
    const from = new Date(shopTime(today, 0, settings.timezone));
    const to = new Date(shopTime(today, 24 * 60, settings.timezone));

    const [appointments, offers] = await Promise.all([
      prisma.appointment.findMany({
        where: { startAt: { gte: from, lt: to }, status: { in: ["CHECKED_IN", "IN_PROGRESS"] } },
        orderBy: { startAt: "asc" },
        select: {
          id: true,
          startAt: true,
          endAt: true,
          status: true,
          barberId: true,
          durationMinutes: true,
          customer: { select: { name: true } },
          barber: { select: { id: true, name: true } },
          services: { select: { serviceName: true } },
        },
      }),
      prisma.offer.findMany({
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, titleAr: true, price: true, wasPrice: true, startsAt: true, endsAt: true, isActive: true },
      }),
    ]);

    const inChair = appointments.filter((a) => a.status === "IN_PROGRESS");
    const waiting = appointments.filter((a) => a.status === "CHECKED_IN");

    return NextResponse.json({
      now: new Date(),
      inChair: inChair.map((a) => ({
        id: a.id,
        name: firstName(a.customer.name),
        barber: a.barber?.name ?? null,
        endAt: a.endAt,
        services: a.services.map((s) => s.serviceName),
      })),
      waiting: estimateWaits(waiting, inChair).map((row, index) => ({
        id: row.appointment.id,
        position: index + 1,
        name: firstName(row.appointment.customer.name),
        barber: row.appointment.barber?.name ?? null,
        waitMinutes: row.waitMinutes,
      })),
      offers: offers.filter((o) => isRunning(o)).map((o) => ({
        id: o.id,
        title: o.title,
        titleAr: o.titleAr,
        price: o.price,
        wasPrice: o.wasPrice,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
