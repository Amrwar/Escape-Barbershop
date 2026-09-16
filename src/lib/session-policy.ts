// How long a sign-in lives. Shared by the server (which enforces it) and the
// browser (which signs out on time instead of waiting for the next request).

/** A staff login never outlives this, however busy the device is. */
export const MAX_SESSION_MS = 2 * 60 * 60 * 1000;

/** No clicks, taps or keys for this long and the shop device is signed out. */
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** A customer's own phone: stays signed in unless they are away for a month. */
export const CUSTOMER_MAX_SESSION_MS = 90 * 24 * 60 * 60 * 1000;
export const CUSTOMER_IDLE_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000;

export function isCustomerRole(role: unknown): boolean {
  return role === "CUSTOMER";
}

export function maxSessionMsFor(role: unknown): number {
  return isCustomerRole(role) ? CUSTOMER_MAX_SESSION_MS : MAX_SESSION_MS;
}

export function idleTimeoutMsFor(role: unknown): number {
  return isCustomerRole(role) ? CUSTOMER_IDLE_TIMEOUT_MS : IDLE_TIMEOUT_MS;
}

/** How often an active browser tells the server it is still in use. */
export const ACTIVITY_PING_MS = 60 * 1000;

/** Whether a login that started at `loginAt` has reached the hard cap. */
export function isPastMaxSession(loginAt: unknown, now = Date.now(), role?: unknown): boolean {
  return typeof loginAt !== "number" || now - loginAt >= maxSessionMsFor(role);
}

/**
 * Seconds a freshly issued token may live: the idle window, cut short so it
 * never runs past the hard cap. A token without a login time gets nothing.
 */
export function tokenLifetimeSeconds(loginAt: unknown, now = Date.now(), role?: unknown): number {
  if (typeof loginAt !== "number") return 0;
  const untilCap = loginAt + maxSessionMsFor(role) - now;
  return Math.max(0, Math.floor(Math.min(idleTimeoutMsFor(role), untilCap) / 1000));
}
