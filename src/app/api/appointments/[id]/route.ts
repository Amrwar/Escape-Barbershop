import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireOwnerOrCashier } from "@/lib/auth";
import { appointmentUpdateSchema } from "@/lib/validations";
import { recordAudit } from "@/lib/audit";
import { offerFreedSlot } from "@/lib/waitlist-server";
import { getBookingSettings, getShopHours } from "@/lib/booking-server";
import { MINUTE, shopDateISO, workingWindow } from "@/lib/booking";
import { BookingError, appointmentInclude, bookingErrorResponse } from "@/lib/appointment-api";

const BLOCKING = ["PENDING", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED", "COMPLETED_UNPAID"] as const;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth();
    const appointment = await prisma.appointment.findUnique({
      where: { id: params.id },
      include: appointmentInclude,
    });
    if (!appointment) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(appointment);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/** Reschedule, move to another barber, change the services, or set the status. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authSession = await requireOwnerOrCashier();
    const body = await req.json();
    const data = appointmentUpdateSchema.parse(body);

    const before = await prisma.appointment.findUnique({
      where: { id: params.id },
      include: appointmentInclude,
    });
    if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (before.visitId) {
      return NextResponse.json({ error: "This appointment has already been rung up" }, { status: 409 });
    }

    const settings = await getBookingSettings();
    const shopHours = await getShopHours();

    const updated = await prisma.$transaction(
      async (tx) => {
        // Services first: they decide how long the appointment runs.
        let services = before.services.map((s) => ({
          serviceId: s.serviceId,
          serviceName: s.serviceName,
          price: s.price,
          durationMinutes: s.durationMinutes,
        }));
        if (data.serviceIds) {
          const rows = await tx.service.findMany({
            where: { id: { in: data.serviceIds }, isActive: true },
            select: { id: true, name: true, defaultPrice: true, durationMinutes: true },
          });
          if (rows.length !== new Set(data.serviceIds).size) {
            throw new BookingError("Unknown or inactive service", 400);
          }
          services = rows.map((s) => ({
            serviceId: s.id,
            serviceName: s.name,
            price: s.defaultPrice,
            durationMinutes: s.durationMinutes,
          }));
        }

        const durationMinutes = services.reduce((s, x) => s + x.durationMinutes, 0);
        const totalPrice = services.reduce((s, x) => s + x.price, 0);
        const startAt = data.startAt ? new Date(data.startAt) : before.startAt;
        if (Number.isNaN(startAt.getTime())) throw new BookingError("Invalid start time", 400);
        const endAt = new Date(startAt.getTime() + durationMinutes * MINUTE);
        const barberId = data.barberId === undefined ? before.barberId : data.barberId;
        const status = data.status ?? before.status;

        const movedOrRelengthened =
          startAt.getTime() !== before.startAt.getTime() ||
          endAt.getTime() !== before.endAt.getTime() ||
          barberId !== before.barberId;

        // Only re-check the chair while the appointment still holds one.
        if (barberId && movedOrRelengthened && (BLOCKING as readonly string[]).includes(status)) {
          const barber = await tx.barber.findUnique({
            where: { id: barberId },
            select: { id: true, isActive: true, workingHours: true, services: { select: { serviceId: true } } },
          });
          if (!barber || !barber.isActive) throw new BookingError("That barber is not available", 400);
          if (barber.services.length > 0 && !services.every((s) => barber.services.some((bs) => bs.serviceId === s.serviceId))) {
            throw new BookingError("That barber does not do one of these services", 400);
          }
          const dateISO = shopDateISO(startAt.getTime(), settings.timezone);
          const window = workingWindow(dateISO, shopHours, barber.workingHours, settings.timezone);
          if (!window || startAt.getTime() < window.start || endAt.getTime() > window.end) {
            throw new BookingError("That time is outside the barber's working hours", 409);
          }

          const pad = settings.bufferMinutes * MINUTE;
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
          if (clash) throw new BookingError("That time has just been taken", 409);
          if (off) throw new BookingError("The barber is off at that time", 409);
        }

        if (data.serviceIds) {
          await tx.appointmentService.deleteMany({ where: { appointmentId: before.id } });
        }

        return tx.appointment.update({
          where: { id: before.id },
          data: {
            barberId,
            startAt,
            endAt,
            durationMinutes,
            totalPrice,
            status,
            notes: data.notes === undefined ? undefined : data.notes || null,
            ...(status === "CANCELLED"
              ? { cancelledAt: new Date(), cancelReason: data.cancelReason || null }
              : { cancelledAt: null, cancelReason: null }),
            ...(data.serviceIds ? { services: { create: services } } : {}),
          },
          include: appointmentInclude,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    await recordAudit(authSession, {
      action: "UPDATE",
      entity: "APPOINTMENT",
      entityId: updated.id,
      amount: updated.totalPrice,
      summary: `${updated.customer.name}: ${describeAppointment(before)} -> ${describeAppointment(updated)}`,
      details: { before: describeAppointment(before) },
    });

    // The diary can cancel by changing the status as well as through the cancel
    // button, and either way the chair is free: tell whoever has waited longest.
    if (updated.status === "CANCELLED" && before.status !== "CANCELLED") {
      await offerFreedSlot(updated.id);
    }

    return NextResponse.json(updated);
  } catch (err: unknown) {
    return bookingErrorResponse(err);
  }
}

/** Cancelling keeps the record and frees the chair; nothing is really deleted. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authSession = await requireOwnerOrCashier();
    const reason = req.nextUrl.searchParams.get("reason");

    const appointment = await prisma.appointment.findUnique({
      where: { id: params.id },
      include: appointmentInclude,
    });
    if (!appointment) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const cancelled = await prisma.appointment.update({
      where: { id: params.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason || null },
      include: appointmentInclude,
    });

    // The chair is free again: tell whoever has waited longest for it.
    await offerFreedSlot(params.id);

    await recordAudit(authSession, {
      action: "UPDATE",
      entity: "APPOINTMENT",
      entityId: cancelled.id,
      amount: cancelled.totalPrice,
      summary: `Cancelled ${describeAppointment(appointment)}`,
      details: { reason: reason || null },
    });

    return NextResponse.json(cancelled);
  } catch (err: unknown) {
    return bookingErrorResponse(err);
  }
}

function describeAppointment(a: {
  startAt: Date;
  status: string;
  barber?: { name: string } | null;
  services: { serviceName: string }[];
}): string {
  return `${a.startAt.toISOString()} ${a.barber?.name ?? "unassigned"} ${a.services.map((s) => s.serviceName).join(", ")} (${a.status})`;
}
