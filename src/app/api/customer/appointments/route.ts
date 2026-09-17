import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/auth";
import { customerBookingSchema } from "@/lib/validations";
import { BookingError, bookingErrorResponse } from "@/lib/appointment-api";
import { createAppointment } from "@/lib/booking-create";
import { getBookingSettings } from "@/lib/booking-server";
import { MINUTE } from "@/lib/booking";
import { MAX_UPCOMING_APPOINTMENTS, UPCOMING_STATUSES, customerAppointmentView } from "@/lib/customer-api";
import { sendPushQuietly } from "@/lib/push";
import { bookingConfirmedMessage } from "@/lib/reminders";
import { depositFor, holdExpiry, needsDeposit, referenceFor } from "@/lib/deposits";
import { getDepositPolicy, getInstapayAddress } from "@/lib/deposits-server";

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

    // Expensive work is held rather than given, until the deposit arrives —
    // but only when the shop has somewhere for the money to go. A policy with
    // no InstaPay address behind it would ask for a transfer into thin air.
    const policy = await getDepositPolicy();
    const instapay = policy.enabled ? await getInstapayAddress() : null;

    // Priced from the shop's own list rather than anything the client sent.
    const quoted = await prisma.service.findMany({
      where: { id: { in: data.serviceIds }, isActive: true, bookableOnline: true },
      select: { defaultPrice: true },
    });
    const quotedTotal = quoted.reduce((sum, s) => sum + s.defaultPrice, 0);

    const wantsDeposit = Boolean(instapay) && needsDeposit(quotedTotal, policy);
    const depositAmount = wantsDeposit ? depositFor(quotedTotal, policy) : 0;

    const created = await createAppointment({
      customerId: session.user.customerId,
      barberId: data.barberId ?? null,
      startAt,
      serviceIds: data.serviceIds,
      notes: data.notes || null,
      source: "ONLINE",
      onlineOnly: true,
      deposit: wantsDeposit ? { amount: depositAmount, holdUntil: holdExpiry(Date.now(), policy) } : null,
    });

    // The reference is made from the booking's own id, so it can only be set
    // once there is one.
    if (wantsDeposit) {
      await prisma.appointment.update({
        where: { id: created.id },
        data: { depositRef: referenceFor(created.id) },
      });
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: created.id },
      select: customerAppointmentView,
    });

    if (!wantsDeposit) sendPushQuietly(
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

    return NextResponse.json(
      wantsDeposit
        ? {
            ...appointment,
            deposit: {
              amount: depositAmount,
              reference: referenceFor(created.id),
              instapay,
              holdUntil: holdExpiry(Date.now(), policy),
            },
          }
        : appointment,
      { status: 201 }
    );
  } catch (err: unknown) {
    return bookingErrorResponse(err);
  }
}
