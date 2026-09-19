/** Who is who, and which door a path belongs to. Kept tiny for the edge runtime. */

export const STAFF_ROLES = ["OWNER", "CASHIER"];

export function isStaffRole(role: unknown): boolean {
  return STAFF_ROLES.includes(String(role));
}

/**
 * Whether a path belongs to the customer app. Matched segment by segment on
 * purpose: "/appointments" is a shop screen and must never count as "/app".
 */
export function isCustomerPath(pathname: string): boolean {
  return pathname === "/app" || pathname.startsWith("/app/");
}

/** Whether a path belongs to a barber's own screens. */
export function isBarberPath(pathname: string): boolean {
  return pathname === "/barber" || pathname.startsWith("/barber/");
}

/**
 * The parts of the customer app open to everyone.
 *
 * Sign-in, obviously. Beyond that, the two things a shop puts on its own door:
 * what it charges and who is in. Making somebody create an account to read a
 * price list is the wrong way round — it is the question they ask *before*
 * deciding to come, and both screens read endpoints that are already public.
 *
 * Nothing here touches a customer's own record.
 */
const PUBLIC_CUSTOMER_PATHS = ["/app/login", "/app/prices", "/app/roster"];

export function isPublicCustomerPath(pathname: string): boolean {
  return PUBLIC_CUSTOMER_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
