import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/auth";
import { customerRescheduleSchema } from "@/lib/validations";
import { BookingError, bookingErrorResponse } from "@/lib/appointment-api";
import { offerFreedSlot } from "@/lib/waitlist-server";
import { getBookingSettings, getShopHours } from "@/lib/booking-server";
import { MINUTE, shopDateISO, workingWindow } from "@/lib/booking";
import { UPCOMING_STATUSES, customerAppointmentView } from "@/lib/customer-api";

const BLOCKING = ["PENDING", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED", "COMPLETED_UNPAID"] as const;

/** The customer's own appointment, or nothing — never someone else's. */
async function ownAppointment(customerId: string, id: string) {
  const appointment = await prisma.appointment.findFirst({
    where: { id, customerId },
    select: { ...customerAppointmentView, visitId: true },
  });
  if (!appointment) throw new BookingError("Appointment not found", 404);
  return appointment;
}

/** Too close to the appointment to change it themselves. */
function assertInTime(startAt: Date, cancelWindowMinutes: number) {
  if (startAt.getTime() - Date.now() < cancelWindowMinutes * MINUTE) {
    throw new BookingError("It is too late to change this online — please call the shop", 409);
  }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireCustomer();
    return NextResponse.json(await ownAppointment(session.user.customerId, params.id));
  } catch (err) {
    return bookingErrorResponse(err);
  }
}

/** Move an appointment to another free time. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireCustomer();
    const body = await req.json();
    const data = customerRescheduleSchema.parse(body);

    const before = await ownAppointment(session.user.customerId, params.id);
    if (!(UPCOMING_STATUSES as readonly string[]).includes(before.status)) {
      throw new BookingError("That appointment can no longer be changed", 409);
    }

    const settings = await getBookingSettings();
    assertInTime(before.startAt, settings.cancelWindowMinutes);

    const startAt = new Date(data.startAt);
    if (Number.isNaN(startAt.getTime())) throw new BookingError("Please choose a time", 400);
    const now = Date.now();
    if (startAt.getTime() < now + settings.minNoticeMinutes * MINUTE) {
      throw new BookingError("That time is too soon — please choose a later one", 409);
    }
    if (startAt.getTime() > now + settings.maxDaysAhead * 24 * 60 * MINUTE) {
      throw new BookingError(`Bookings open ${settings.maxDaysAhead} days ahead`, 409);
    }

    const endAt = new Date(startAt.getTime() + before.durationMinutes * MINUTE);
    const shopHours = await getShopHours();
    const dateISO = shopDateISO(startAt.getTime(), settings.timezone);

    const updated = await prisma.$transaction(
      async (tx) => {
        const serviceIds = before.services.map((s) => s.serviceId);
        const wanted = data.barberId === undefined ? before.barber?.id ?? null : data.barberId;

        const pad = settings.bufferMinutes * MINUTE;
        const isFree = async (barberId: string) => {
          const [clash, off] = await Promise.all([
            tx.appointment.findFirst({
              where: {
                barberId,
                id: { not: before.id },
                status: { in: [...BLOCKING] },
                startAt: { lt: new Date(endAt.getTime() + pad) },
                endAt: { gt: new Date(startAt.getTime() - pad) },
              },
              select: { id: true },
            }),
            tx.barberTimeOff.findFirst({
              where: { barberId, startAt: { lt: endAt }, endAt: { gt: startAt } },
              select: { id: true },
            }),
          ]);
          return !clash && !off;
        };
        const worksThen = (hours: { weekday: number; startMinute: number; endMinute: number; isWorking: boolean }[]) => {
          const window = workingWindow(dateISO, shopHours, hours, settings.timezone);
          return !!window && startAt.getTime() >= window.start && endAt.getTime() <= window.end;
        };

        const candidates = await tx.barber.findMany({
          where: { isActive: true, bookableOnline: true, ...(wanted ? { id: wanted } : {}) },
          select: { id: true, workingHours: true, services: { select: { serviceId: true } } },
          orderBy: { name: "asc" },
        });

        let barberId: string | null = null;
        for (const c of candidates) {
          const canDo = c.services.length === 0 || serviceIds.every((id) => c.services.some((bs) => bs.serviceId === id));
          if (!canDo || !worksThen(c.workingHours)) continue;
          if (await isFree(c.id)) {
            barberId = c.id;
            break;
          }
        }
        if (!barberId) throw new BookingError("That time has just been taken", 409);

        return tx.appointment.update({
          where: { id: before.id },
          data: { startAt, endAt, barberId },
          select: customerAppointmentView,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    return NextResponse.json(updated);
  } catch (err) {
    return bookingErrorResponse(err);
  }
}

/** Cancel. The record stays, and the chair is freed for somebody else. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireCustomer();
    const before = await ownAppointment(session.user.customerId, params.id);
    if (!(UPCOMING_STATUSES as readonly string[]).includes(before.status)) {
      throw new BookingError("That appointment can no longer be cancelled", 409);
    }

    const settings = await getBookingSettings();
    assertInTime(before.startAt, settings.cancelWindowMinutes);

    const cancelled = await prisma.appointment.update({
      where: { id: before.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "Cancelled by the customer" },
      select: customerAppointmentView,
    });

    // The chair is free again: tell whoever has waited longest for it.
    await offerFreedSlot(before.id);

    return NextResponse.json(cancelled);
  } catch (err) {
    return bookingErrorResponse(err);
  }
}
