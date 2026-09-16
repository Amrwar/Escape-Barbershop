import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { MINUTE, shopDateISO, workingWindow } from "./booking";
import { getBookingSettings, getShopHours } from "./booking-server";
import { BookingError, appointmentInclude } from "./appointment-api";

/**
 * Saving an appointment, used by both the shop screens and the customer app so
 * the two can never drift apart. The clash check runs inside a serializable
 * transaction, so two people cannot take the last slot at the same moment.
 */

const BLOCKING = ["PENDING", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED"] as const;

export interface CreateAppointmentInput {
  customerId: string;
  /** Null asks the shop to pick whoever is free. */
  barberId?: string | null;
  startAt: Date;
  serviceIds: string[];
  notes?: string | null;
  source: "ONLINE" | "PHONE" | "WALK_IN" | "STAFF";
  createdByUserId?: string | null;
  /** Customer bookings may only use services and barbers marked bookable. */
  onlineOnly?: boolean;
  /** A walk-in may wait in the queue without a barber. */
  requireBarber?: boolean;
}

export async function createAppointment(input: CreateAppointmentInput) {
  const { startAt } = input;
  if (Number.isNaN(startAt.getTime())) throw new BookingError("Invalid start time", 400);

  const services = await prisma.service.findMany({
    where: {
      id: { in: input.serviceIds },
      isActive: true,
      ...(input.onlineOnly ? { bookableOnline: true } : {}),
    },
    select: { id: true, name: true, defaultPrice: true, durationMinutes: true },
  });
  if (services.length !== new Set(input.serviceIds).size) {
    throw new BookingError("Unknown or unavailable service", 400);
  }

  const durationMinutes = services.reduce((s, x) => s + x.durationMinutes, 0);
  const totalPrice = services.reduce((s, x) => s + x.defaultPrice, 0);
  const endAt = new Date(startAt.getTime() + durationMinutes * MINUTE);
  const settings = await getBookingSettings();
  const shopHours = await getShopHours();
  const dateISO = shopDateISO(startAt.getTime(), settings.timezone);
  const requireBarber = input.requireBarber ?? true;

  return prisma.$transaction(
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

      let barberId = input.barberId ?? null;

      if (barberId) {
        const barber = await tx.barber.findUnique({
          where: { id: barberId },
          select: {
            id: true,
            isActive: true,
            bookableOnline: true,
            workingHours: true,
            services: { select: { serviceId: true } },
          },
        });
        if (!barber || !barber.isActive || (input.onlineOnly && !barber.bookableOnline)) {
          throw new BookingError("That barber is not available", 400);
        }
        if (barber.services.length > 0 && !services.every((s) => barber.services.some((bs) => bs.serviceId === s.id))) {
          throw new BookingError("That barber does not do one of these services", 400);
        }
        if (!worksThen(barber.workingHours)) throw new BookingError("That time is outside the barber's working hours", 409);
        if (!(await isFree(barber.id))) throw new BookingError("That time has just been taken", 409);
      } else if (requireBarber) {
        const candidates = await tx.barber.findMany({
          where: { isActive: true, ...(input.onlineOnly ? { bookableOnline: true } : {}) },
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
          customerId: input.customerId,
          barberId,
          startAt,
          endAt,
          durationMinutes,
          totalPrice,
          notes: input.notes || null,
          source: input.source,
          status: "CONFIRMED",
          createdByUserId: input.createdByUserId ?? null,
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
}
