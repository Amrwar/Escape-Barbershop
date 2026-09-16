import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireOwnerOrCashier } from "@/lib/auth";
import { walkInSchema } from "@/lib/validations";
import { recordAudit } from "@/lib/audit";
import { appointmentInclude, bookingErrorResponse } from "@/lib/appointment-api";
import { createAppointment } from "@/lib/booking-create";
import { MINUTE, shopDateISO, shopTime } from "@/lib/booking";
import { getBookingSettings } from "@/lib/booking-server";
import { estimateWaits } from "@/lib/queue";

/**
 * The floor, right now: who is in a chair, who is next, and who is waiting.
 *
 * A walk-in is the same Appointment as a booking — it simply starts now and may
 * have nobody assigned yet. That keeps one diary, one set of takings and one
 * customer history, however the customer arrived.
 */

export async function GET() {
  try {
    await requireAuth();
    const settings = await getBookingSettings();
    const today = shopDateISO(Date.now(), settings.timezone);
    const from = new Date(shopTime(today, 0, settings.timezone));
    const to = new Date(shopTime(today, 24 * 60, settings.timezone));

    const appointments = await prisma.appointment.findMany({
      where: {
        startAt: { gte: from, lt: to },
        status: { in: ["CONFIRMED", "CHECKED_IN", "IN_PROGRESS"] },
      },
      orderBy: [{ startAt: "asc" }],
      include: appointmentInclude,
    });

    const inChair = appointments.filter((a) => a.status === "IN_PROGRESS");
    const waiting = appointments.filter((a) => a.status === "CHECKED_IN");
    const expected = appointments.filter((a) => a.status === "CONFIRMED");

    return NextResponse.json({
      inChair,
      waiting: estimateWaits(waiting, inChair),
      expected,
      barbers: await prisma.barber.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/** A customer who has just walked in: into the queue, starting now. */
export async function POST(req: NextRequest) {
  try {
    const authSession = await requireOwnerOrCashier();
    const body = await req.json();
    const data = walkInSchema.parse(body);

    const appointment = await createAppointment({
      customerId: data.customerId,
      barberId: data.barberId ?? null,
      // Now, rounded down to the minute: the queue is about order, not the clock.
      startAt: new Date(Math.floor(Date.now() / MINUTE) * MINUTE),
      serviceIds: data.serviceIds,
      notes: data.notes || null,
      source: "WALK_IN",
      createdByUserId: authSession.user.id,
      // Nobody has to be free this minute; they wait their turn.
      requireBarber: false,
      skipHoursCheck: true,
    });

    // A walk-in is in the shop, so they are waiting, not merely expected.
    const queued = await prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: "CHECKED_IN" },
      include: appointmentInclude,
    });

    await recordAudit(authSession, {
      action: "CREATE",
      entity: "APPOINTMENT",
      entityId: queued.id,
      amount: queued.totalPrice,
      summary: `Walk-in: ${queued.customer.name} — ${queued.services.map((s) => s.serviceName).join(", ")}`,
    });

    return NextResponse.json(queued, { status: 201 });
  } catch (err) {
    return bookingErrorResponse(err);
  }
}
