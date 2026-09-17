import { NextRequest, NextResponse } from "next/server";
import { type AppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireOwnerOrCashier } from "@/lib/auth";
import { appointmentSchema } from "@/lib/validations";
import { recordAudit } from "@/lib/audit";
import { appointmentInclude, bookingErrorResponse } from "@/lib/appointment-api";
import { createAppointment } from "@/lib/booking-create";
import { sendPushQuietly } from "@/lib/push";
import { bookingConfirmedMessage } from "@/lib/reminders";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = req.nextUrl;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const barberId = searchParams.get("barberId");
    const customerId = searchParams.get("customerId");
    const status = searchParams.get("status");

    const appointments = await prisma.appointment.findMany({
      where: {
        ...(from || to
          ? { startAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
          : {}),
        ...(barberId ? { barberId } : {}),
        ...(customerId ? { customerId } : {}),
        ...(status ? { status: { in: status.split(",") as AppointmentStatus[] } } : {}),
      },
      orderBy: { startAt: "asc" },
      include: appointmentInclude,
    });
    return NextResponse.json(appointments);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authSession = await requireOwnerOrCashier();
    const body = await req.json();
    const data = appointmentSchema.parse(body);

    const appointment = await createAppointment({
      customerId: data.customerId,
      barberId: data.barberId ?? null,
      startAt: new Date(data.startAt),
      serviceIds: data.serviceIds,
      notes: data.notes || null,
      source: data.source,
      createdByUserId: authSession.user.id,
      // A walk-in may wait in the queue before a barber is free.
      requireBarber: !(data.source === "WALK_IN" && !data.barberId),
    });

    await recordAudit(authSession, {
      action: "CREATE",
      entity: "APPOINTMENT",
      entityId: appointment.id,
      amount: appointment.totalPrice,
      summary: `Booked ${appointment.customer.name} with ${appointment.barber?.name ?? "no barber yet"} — ${appointment.services
        .map((s) => s.serviceName)
        .join(", ")}`,
      details: { startAt: appointment.startAt, source: appointment.source },
    });

    // The shop booked it for them; their phone should still hear about it.
    sendPushQuietly(
      { customerId: appointment.customerId },
      bookingConfirmedMessage({
        id: appointment.id,
        startAt: appointment.startAt,
        barberName: appointment.barber?.name ?? null,
        services: appointment.services.map((s) => s.serviceName),
      })
    );

    return NextResponse.json(appointment, { status: 201 });
  } catch (err: unknown) {
    return bookingErrorResponse(err);
  }
}
