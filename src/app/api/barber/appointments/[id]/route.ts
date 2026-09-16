import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBarber } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { BookingError, bookingErrorResponse } from "@/lib/appointment-api";
import { MINUTE } from "@/lib/booking";

/**
 * A barber moving their own appointment along: the customer has arrived, is in
 * the chair, or never turned up.
 *
 * Deliberately narrow. Taking the money stays at the till, and a barber cannot
 * move, cancel or re-price a booking — that is the shop's job, and keeping it
 * that way is what stops the diary and the takings drifting apart.
 */
const ALLOWED = ["CHECKED_IN", "IN_PROGRESS", "NO_SHOW"] as const;
type Allowed = (typeof ALLOWED)[number];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireBarber();
    const barberId = session.user.barberId;
    const { status } = (await req.json()) as { status?: string };

    if (!status || !(ALLOWED as readonly string[]).includes(status)) {
      throw new BookingError("A barber can only mark someone as arrived, started, or a no-show", 400);
    }

    const appointment = await prisma.appointment.findFirst({
      where: { id: params.id, barberId },
      select: { id: true, status: true, visitId: true, durationMinutes: true, customer: { select: { name: true } } },
    });
    if (!appointment) throw new BookingError("Appointment not found", 404);
    if (appointment.visitId) throw new BookingError("This appointment has already been rung up", 409);
    if (["CANCELLED", "COMPLETED", "COMPLETED_UNPAID", "NO_SHOW"].includes(appointment.status)) {
      throw new BookingError("That appointment is already closed", 409);
    }

    // Starting resets the clock, as it does on the queue: the chair is taken
    // from the moment they sit down.
    const startAt = status === "IN_PROGRESS" ? new Date(Math.floor(Date.now() / MINUTE) * MINUTE) : undefined;

    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: status as Allowed,
        ...(startAt ? { startAt, endAt: new Date(startAt.getTime() + appointment.durationMinutes * MINUTE) } : {}),
      },
      select: { id: true, status: true, startAt: true, endAt: true },
    });

    await recordAudit(session, {
      action: "UPDATE",
      entity: "APPOINTMENT",
      entityId: updated.id,
      summary: `${appointment.customer.name}: marked ${status.toLowerCase().replace("_", " ")} by the barber`,
    });

    return NextResponse.json(updated);
  } catch (err) {
    return bookingErrorResponse(err);
  }
}
