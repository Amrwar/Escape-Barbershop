import { Prisma } from "@prisma/client";

/**
 * What a customer is allowed to see of their own booking: no staff notes, no
 * ids they cannot act on. Shared by the customer routes, which may only export
 * route handlers of their own.
 */
export const customerAppointmentView = {
  id: true,
  startAt: true,
  endAt: true,
  status: true,
  durationMinutes: true,
  totalPrice: true,
  notes: true,
  cancelledAt: true,
  depositAmount: true,
  depositStatus: true,
  depositRef: true,
  barber: { select: { id: true, name: true, photo: true } },
  services: { select: { id: true, serviceId: true, serviceName: true, price: true, durationMinutes: true } },
} satisfies Prisma.AppointmentSelect;

/** How many appointments a customer may have waiting at once. */
export const MAX_UPCOMING_APPOINTMENTS = 3;

/** Statuses that mean the appointment is still ahead of the customer. */
export const UPCOMING_STATUSES = ["PENDING", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS"] as const;
