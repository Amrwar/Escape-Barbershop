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

/** The customer app's own sign-in page, which is open to everyone. */
export function isCustomerLoginPath(pathname: string): boolean {
  return pathname === "/app/login" || pathname.startsWith("/app/login/");
}
