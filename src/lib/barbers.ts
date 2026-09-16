import type { Prisma } from "@prisma/client";

/**
 * Who a customer is allowed to see and book.
 *
 * A barber record can belong to someone who runs the shop rather than cuts hair
 * — an owner or a manager keeping their own sales — and those must never appear
 * in the customer app. The shop can also hide anyone by hand with the
 * "takes bookings in the app" switch on the barbers screen; this is the rule
 * that applies even when nobody has touched that switch.
 */
export const CUSTOMER_FACING_BARBER = {
  OR: [{ user: { is: null } }, { user: { role: { notIn: ["OWNER", "CASHIER"] } } }],
} satisfies Prisma.BarberWhereInput;
