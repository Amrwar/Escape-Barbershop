import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { sendPushQuietly } from "@/lib/push";

/**
 * The owner answering a barber's request for time off.
 *
 * Saying yes is the moment the diary stops taking bookings for those days — up
 * to here, asking has changed nothing. So the answer checks what has already
 * been booked and says so rather than silently stranding customers.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authSession = await requireOwner();
    const body = await req.json().catch(() => ({}));
    const approve = Boolean(body?.approve);

    const request = await prisma.barberTimeOff.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        status: true,
        startAt: true,
        endAt: true,
        barberId: true,
        barber: { select: { name: true, user: { select: { id: true } } } },
      },
    });
    if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (request.status !== "REQUESTED") {
      return NextResponse.json({ error: "That has already been answered" }, { status: 409 });
    }

    // Approving does not cancel anybody: the shop is told what is in the way
    // and moves those bookings itself, because a customer's appointment is not
    // something to drop without a word.
    const clashing = approve
      ? await prisma.appointment.count({
          where: {
            barberId: request.barberId,
            status: { in: ["PENDING", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS"] },
            startAt: { lt: request.endAt },
            endAt: { gt: request.startAt },
          },
        })
      : 0;

    const updated = await prisma.barberTimeOff.update({
      where: { id: request.id },
      data: {
        status: approve ? "APPROVED" : "DECLINED",
        decidedById: authSession.user.id,
        decidedAt: new Date(),
      },
      select: { id: true, status: true, startAt: true, endAt: true },
    });

    await recordAudit(authSession, {
      action: "UPDATE",
      entity: "BARBER",
      entityId: request.barberId,
      summary: `${approve ? "Approved" : "Declined"} time off for ${request.barber.name}`,
      details: { from: request.startAt, to: request.endAt, bookingsInTheWay: clashing },
    });

    // The barber asked on their phone; they hear back on it.
    const staffUserId = request.barber.user?.id;
    if (staffUserId) {
      sendPushQuietly(
        { userId: staffUserId },
        {
          title: approve ? "Time off approved" : "Time off declined",
          body: new Intl.DateTimeFormat("en-GB", {
            timeZone: "Africa/Cairo",
            day: "numeric",
            month: "long",
          }).format(request.startAt),
          url: "/barber",
          tag: `timeoff-${request.id}`,
        }
      );
    }

    return NextResponse.json({ ...updated, bookingsInTheWay: clashing });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[time-off]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
