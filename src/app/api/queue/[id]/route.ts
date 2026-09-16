import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOwnerOrCashier } from "@/lib/auth";
import { queueActionSchema } from "@/lib/validations";
import { BookingError, appointmentInclude, bookingErrorResponse } from "@/lib/appointment-api";
import { MINUTE } from "@/lib/booking";

/**
 * Moving somebody through the queue: give them a chair, and start them in it.
 *
 * Starting resets the appointment to now, because the queue runs on when the
 * customer actually sat down, not when they arrived or what was booked.
 */

const IN_A_CHAIR = ["IN_PROGRESS"] as const;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authSession = await requireOwnerOrCashier();
    const body = await req.json();
    const data = queueActionSchema.parse(body);

    const updated = await prisma.$transaction(
      async (tx) => {
        const appointment = await tx.appointment.findUnique({
          where: { id: params.id },
          select: { id: true, status: true, durationMinutes: true, barberId: true, visitId: true },
        });
        if (!appointment) throw new BookingError("That appointment no longer exists", 404);
        if (appointment.visitId) throw new BookingError("This appointment has already been rung up", 409);
        if (["CANCELLED", "NO_SHOW", "COMPLETED", "COMPLETED_UNPAID"].includes(appointment.status)) {
          throw new BookingError("That appointment is already closed", 409);
        }

        const barberId = data.barberId === undefined ? appointment.barberId : data.barberId;
        if (data.start && !barberId) throw new BookingError("Choose a barber first", 400);

        if (data.start && barberId) {
          // One barber, one chair: they must not already be mid-cut.
          const busy = await tx.appointment.findFirst({
            where: { barberId, id: { not: appointment.id }, status: { in: [...IN_A_CHAIR] } },
            select: { id: true },
          });
          if (busy) throw new BookingError("That barber is still with someone", 409);
        }

        const startAt = data.start ? new Date(Math.floor(Date.now() / MINUTE) * MINUTE) : undefined;

        return tx.appointment.update({
          where: { id: appointment.id },
          data: {
            barberId,
            ...(data.start
              ? {
                  status: "IN_PROGRESS",
                  startAt,
                  endAt: new Date(startAt!.getTime() + appointment.durationMinutes * MINUTE),
                }
              : {}),
          },
          include: appointmentInclude,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    await recordQueueMove(authSession, updated, data.start === true);
    return NextResponse.json(updated);
  } catch (err) {
    return bookingErrorResponse(err);
  }
}

async function recordQueueMove(
  authSession: { user: { id: string; name?: string | null; email?: string | null; role: string } },
  appointment: { id: string; customer: { name: string }; barber: { name: string } | null; totalPrice: number },
  started: boolean
) {
  const { recordAudit } = await import("@/lib/audit");
  await recordAudit(authSession, {
    action: "UPDATE",
    entity: "APPOINTMENT",
    entityId: appointment.id,
    amount: appointment.totalPrice,
    summary: started
      ? `Started ${appointment.customer.name} with ${appointment.barber?.name ?? "—"}`
      : `Assigned ${appointment.customer.name} to ${appointment.barber?.name ?? "nobody"}`,
  });
}

/** Take somebody out of the queue: they left, or never showed. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authSession = await requireOwnerOrCashier();
    const reason = req.nextUrl.searchParams.get("reason");

    const appointment = await prisma.appointment.findUnique({
      where: { id: params.id },
      select: { id: true, visitId: true },
    });
    if (!appointment) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (appointment.visitId) {
      return NextResponse.json({ error: "This appointment has already been rung up" }, { status: 409 });
    }

    const removed = await prisma.appointment.update({
      where: { id: params.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason || "Left the queue" },
      include: appointmentInclude,
    });

    const { recordAudit } = await import("@/lib/audit");
    await recordAudit(authSession, {
      action: "UPDATE",
      entity: "APPOINTMENT",
      entityId: removed.id,
      summary: `Removed ${removed.customer.name} from the queue`,
    });

    return NextResponse.json(removed);
  } catch (err) {
    return bookingErrorResponse(err);
  }
}
