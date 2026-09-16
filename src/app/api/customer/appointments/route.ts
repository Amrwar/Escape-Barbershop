import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/auth";
import { customerBookingSchema } from "@/lib/validations";
import { BookingError, bookingErrorResponse } from "@/lib/appointment-api";
import { createAppointment } from "@/lib/booking-create";
import { getBookingSettings } from "@/lib/booking-server";
import { MINUTE } from "@/lib/booking";
import { MAX_UPCOMING_APPOINTMENTS, UPCOMING_STATUSES, customerAppointmentView } from "@/lib/customer-api";

export async function GET(req: NextRequest) {
  try {
    const session = await requireCustomer();
    const scope = req.nextUrl.searchParams.get("scope") ?? "all";
    const now = new Date();

    const appointments = await prisma.appointment.findMany({
      where: {
        customerId: session.user.customerId,
        ...(scope === "upcoming" ? { startAt: { gte: now }, status: { in: [...UPCOMING_STATUSES] } } : {}),
        ...(scope === "past"
          ? { OR: [{ startAt: { lt: now } }, { status: { in: ["COMPLETED", "CANCELLED", "NO_SHOW"] } }] }
          : {}),
      },
      orderBy: { startAt: scope === "past" ? "desc" : "asc" },
      select: customerAppointmentView,
    });

    return NextResponse.json(appointments);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireCustomer();
    const body = await req.json();
    const data = customerBookingSchema.parse(body);

    const settings = await getBookingSettings();
    if (!settings.onlineBookingEnabled) {
      throw new BookingError("Online booking is closed at the moment — please call the shop", 403);
    }

    const startAt = new Date(data.startAt);
    if (Number.isNaN(startAt.getTime())) throw new BookingError("Please choose a time", 400);

    const now = Date.now();
    if (startAt.getTime() < now + settings.minNoticeMinutes * MINUTE) {
      throw new BookingError("That time is too soon — please choose a later one", 409);
    }
    if (startAt.getTime() > now + settings.maxDaysAhead * 24 * 60 * MINUTE) {
      throw new BookingError(`Bookings open ${settings.maxDaysAhead} days ahead`, 409);
    }

    const upcoming = await prisma.appointment.count({
      where: {
        customerId: session.user.customerId,
        startAt: { gte: new Date() },
        status: { in: [...UPCOMING_STATUSES] },
      },
    });
    if (upcoming >= MAX_UPCOMING_APPOINTMENTS) {
      throw new BookingError(`You already have ${MAX_UPCOMING_APPOINTMENTS} appointments booked`, 409);
    }

    const created = await createAppointment({
      customerId: session.user.customerId,
      barberId: data.barberId ?? null,
      startAt,
      serviceIds: data.serviceIds,
      notes: data.notes || null,
      source: "ONLINE",
      onlineOnly: true,
    });

    const appointment = await prisma.appointment.findUnique({
      where: { id: created.id },
      select: customerAppointmentView,
    });
    return NextResponse.json(appointment, { status: 201 });
  } catch (err: unknown) {
    return bookingErrorResponse(err);
  }
}
