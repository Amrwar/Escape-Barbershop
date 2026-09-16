import { NextRequest, NextResponse } from "next/server";
import { Prisma, type AppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireOwnerOrCashier } from "@/lib/auth";
import { appointmentSchema } from "@/lib/validations";
import { recordAudit } from "@/lib/audit";
import { getBookingSettings, getShopHours } from "@/lib/booking-server";
import { BookingError, appointmentInclude, bookingErrorResponse } from "@/lib/appointment-api";
import { MINUTE, shopDateISO, workingWindow } from "@/lib/booking";

const BLOCKING = ["PENDING", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED"] as const;

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

    const startAt = new Date(data.startAt);
    if (Number.isNaN(startAt.getTime())) {
      return NextResponse.json({ error: "Invalid start time" }, { status: 400 });
    }

    const services = await prisma.service.findMany({
      where: { id: { in: data.serviceIds }, isActive: true },
      select: { id: true, name: true, defaultPrice: true, durationMinutes: true },
    });
    if (services.length !== new Set(data.serviceIds).size) {
      return NextResponse.json({ error: "Unknown or inactive service" }, { status: 400 });
    }

    const durationMinutes = services.reduce((s, x) => s + x.durationMinutes, 0);
    const totalPrice = services.reduce((s, x) => s + x.defaultPrice, 0);
    const endAt = new Date(startAt.getTime() + durationMinutes * MINUTE);
    const settings = await getBookingSettings();
    const shopHours = await getShopHours();
    const dateISO = shopDateISO(startAt.getTime(), settings.timezone);

    // A walk-in may wait without a barber; a booking always gets one, picked
    // here when the customer did not mind who.
    const needsBarber = !(data.source === "WALK_IN" && !data.barberId);

    const appointment = await prisma.$transaction(
      async (tx) => {
        const pad = settings.bufferMinutes * MINUTE;
        const busyFrom = new Date(startAt.getTime() - pad);
        const busyTo = new Date(endAt.getTime() + pad);

        const isFree = async (barberId: string) => {
          const [clash, off] = await Promise.all([
            tx.appointment.findFirst({
              where: { barberId, status: { in: [...BLOCKING] }, startAt: { lt: busyTo }, endAt: { gt: busyFrom } },
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

        let barberId = data.barberId ?? null;

        if (barberId) {
          const barber = await tx.barber.findUnique({
            where: { id: barberId },
            select: { id: true, isActive: true, workingHours: true, services: { select: { serviceId: true } } },
          });
          if (!barber || !barber.isActive) throw new BookingError("That barber is not available", 400);
          if (barber.services.length > 0 && !services.every((s) => barber.services.some((bs) => bs.serviceId === s.id))) {
            throw new BookingError("That barber does not do one of these services", 400);
          }
          if (!worksThen(barber.workingHours)) throw new BookingError("That time is outside the barber's working hours", 409);
          if (!(await isFree(barber.id))) throw new BookingError("That time has just been taken", 409);
        } else if (needsBarber) {
          const candidates = await tx.barber.findMany({
            where: { isActive: true },
            select: { id: true, workingHours: true, services: { select: { serviceId: true } } },
            orderBy: { name: "asc" },
          });
          for (const c of candidates) {
            const canDo = c.services.length === 0 || services.every((s) => c.services.some((bs) => bs.serviceId === s.id));
            if (!canDo || !worksThen(c.workingHours)) continue;
            if (await isFree(c.id)) {
              barberId = c.id;
              break;
            }
          }
          if (!barberId) throw new BookingError("No barber is free at that time", 409);
        }

        return tx.appointment.create({
          data: {
            customerId: data.customerId,
            barberId,
            startAt,
            endAt,
            durationMinutes,
            totalPrice,
            notes: data.notes || null,
            source: data.source,
            status: "CONFIRMED",
            createdByUserId: authSession.user.id,
            services: {
              create: services.map((s) => ({
                serviceId: s.id,
                serviceName: s.name,
                price: s.defaultPrice,
                durationMinutes: s.durationMinutes,
              })),
            },
          },
          include: appointmentInclude,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

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

    return NextResponse.json(appointment, { status: 201 });
  } catch (err: unknown) {
    return bookingErrorResponse(err);
  }
}
