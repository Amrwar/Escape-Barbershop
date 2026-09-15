// How long a sign-in lives. Shared by the server (which enforces it) and the
// browser (which signs out on time instead of waiting for the next request).

/** A login never outlives this, however busy the device is. */
export const MAX_SESSION_MS = 2 * 60 * 60 * 1000;

/** No clicks, taps or keys for this long and the device is signed out. */
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** How often an active browser tells the server it is still in use. */
export const ACTIVITY_PING_MS = 60 * 1000;

/** Whether a login that started at `loginAt` has reached the hard cap. */
export function isPastMaxSession(loginAt: unknown, now = Date.now()): boolean {
  return typeof loginAt !== "number" || now - loginAt >= MAX_SESSION_MS;
}

/**
 * Seconds a freshly issued token may live: the idle window, cut short so it
 * never runs past the hard cap. A token without a login time gets nothing.
 */
export function tokenLifetimeSeconds(loginAt: unknown, now = Date.now()): number {
  if (typeof loginAt !== "number") return 0;
  const untilCap = loginAt + MAX_SESSION_MS - now;
  return Math.max(0, Math.floor(Math.min(IDLE_TIMEOUT_MS, untilCap) / 1000));
}
