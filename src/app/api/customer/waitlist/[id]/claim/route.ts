import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/auth";
import { createAppointment } from "@/lib/booking-create";
import { bookingErrorResponse } from "@/lib/appointment-api";
import { customerAppointmentView } from "@/lib/customer-api";
import { getBookingSettings } from "@/lib/booking-server";
import { claimable } from "@/lib/waitlist";
import { sendPushQuietly } from "@/lib/push";
import { bookingConfirmedMessage } from "@/lib/reminders";

/**
 * Taking the slot that opened.
 *
 * The offer is checked again here rather than trusted from when it was sent: a
 * lapsed offer belongs to whoever is next in line, and a slot that has since
 * been taken cannot be handed out twice. The booking goes through the same
 * path as any other, so every rule about clashes and opening hours still holds.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireCustomer();

    const entry = await prisma.waitlistEntry.findUnique({
      where: { id: params.id },
      include: { services: { select: { serviceId: true } } },
    });

    if (!entry || entry.customerId !== session.user.customerId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!claimable({ ...entry, durationMinutes: 0 })) {
      return NextResponse.json({ error: "That offer has gone — somebody else may have taken it" }, { status: 409 });
    }

    const created = await createAppointment({
      customerId: session.user.customerId,
      barberId: entry.barberId,
      startAt: entry.offeredStartAt!,
      serviceIds: entry.services.map((line) => line.serviceId),
      notes: null,
      source: "ONLINE",
      onlineOnly: true,
    });

    await prisma.waitlistEntry.update({
      where: { id: entry.id },
      data: { status: "TAKEN", appointmentId: created.id },
    });

    const settings = await getBookingSettings();
    sendPushQuietly(
      { customerId: session.user.customerId },
      bookingConfirmedMessage(
        {
          id: created.id,
          startAt: created.startAt,
          barberName: created.barber?.name ?? null,
          services: created.services.map((s) => s.serviceName),
        },
        "en",
        settings.timezone
      )
    );

    const appointment = await prisma.appointment.findUnique({
      where: { id: created.id },
      select: customerAppointmentView,
    });

    return NextResponse.json(appointment, { status: 201 });
  } catch (err: unknown) {
    return bookingErrorResponse(err);
  }
}
