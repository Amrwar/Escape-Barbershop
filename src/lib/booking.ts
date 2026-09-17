/**
 * The booking rules, kept pure so they can be tested and reused by the API, the
 * booking screens and (later) the phone app.
 *
 * Times are epoch milliseconds throughout. The shop thinks in its own local
 * time — "Saturday, 10:00 to 22:00" — so the day's window is built from a local
 * date plus minutes-from-midnight in the shop's timezone, which keeps the clock
 * right across the summer-time change.
 */

export const SHOP_TIMEZONE_KEY = "shop_timezone";
export const DEFAULT_SHOP_TIMEZONE = "Africa/Cairo";

/** How often a booking may start: 15 means :00, :15, :30, :45. */
export const DEFAULT_SLOT_MINUTES = 15;
/** How soon from now a customer may book. */
export const DEFAULT_MIN_NOTICE_MINUTES = 60;
/** How far ahead the calendar is open. */
export const DEFAULT_MAX_DAYS_AHEAD = 30;
/** Quiet time kept around every appointment (cleaning up, overrun). */
export const DEFAULT_BUFFER_MINUTES = 0;
/** How close to the appointment a customer may still cancel or move it. */
export const DEFAULT_CANCEL_WINDOW_MINUTES = 120;

export interface BookingSettings {
  slotMinutes: number;
  minNoticeMinutes: number;
  maxDaysAhead: number;
  bufferMinutes: number;
  cancelWindowMinutes: number;
  timezone: string;
  onlineBookingEnabled: boolean;
  /** Tell a regular when they are past their own rhythm. Off until asked for. */
  rebookingRemindersEnabled: boolean;
}

export const DEFAULT_BOOKING_SETTINGS: BookingSettings = {
  rebookingRemindersEnabled: false,
  slotMinutes: DEFAULT_SLOT_MINUTES,
  minNoticeMinutes: DEFAULT_MIN_NOTICE_MINUTES,
  maxDaysAhead: DEFAULT_MAX_DAYS_AHEAD,
  bufferMinutes: DEFAULT_BUFFER_MINUTES,
  cancelWindowMinutes: DEFAULT_CANCEL_WINDOW_MINUTES,
  timezone: DEFAULT_SHOP_TIMEZONE,
  onlineBookingEnabled: true,
};

export interface Interval {
  start: number;
  end: number;
}

export const MINUTE = 60_000;

/** True when two spans share any time at all. Touching ends do not count. */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Sorted, with touching or overlapping spans joined into one. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const next of sorted) {
    const last = merged[merged.length - 1];
    if (last && next.start <= last.end) last.end = Math.max(last.end, next.end);
    else merged.push({ ...next });
  }
  return merged;
}

/** Each busy span widened by the buffer kept on either side of it. */
export function withBuffer(busy: Interval[], bufferMinutes: number): Interval[] {
  const pad = Math.max(0, bufferMinutes) * MINUTE;
  return mergeIntervals(busy.map((b) => ({ start: b.start - pad, end: b.end + pad })));
}

export interface SlotOptions {
  /** When the barber is working, in one unbroken span. */
  window: Interval;
  durationMinutes: number;
  slotMinutes?: number;
  bufferMinutes?: number;
  /** Appointments already booked, plus any time off. */
  busy?: Interval[];
  /** Nothing may start before this — usually now plus the notice period. */
  earliestStart?: number;
}

/**
 * Every start time in the window that fits the whole service without running
 * into a busy span or past the end of the working day.
 */
export function availableSlots({
  window,
  durationMinutes,
  slotMinutes = DEFAULT_SLOT_MINUTES,
  bufferMinutes = DEFAULT_BUFFER_MINUTES,
  busy = [],
  earliestStart,
}: SlotOptions): number[] {
  if (durationMinutes <= 0 || slotMinutes <= 0) return [];
  const length = durationMinutes * MINUTE;
  const step = slotMinutes * MINUTE;
  const blocked = withBuffer(busy, bufferMinutes);
  const slots: number[] = [];

  // Start times stay on the shop's grid (:00, :15, …) even when the first
  // bookable moment falls between two of them.
  let start = window.start;
  if (earliestStart !== undefined && earliestStart > start) {
    start = window.start + Math.ceil((earliestStart - window.start) / step) * step;
  }

  for (; start + length <= window.end; start += step) {
    const slot = { start, end: start + length };
    if (!blocked.some((b) => overlaps(slot, b))) slots.push(start);
  }
  return slots;
}

/** How far the given timezone is ahead of UTC at that moment, in milliseconds. */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const at = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asIfUtc = Date.UTC(at("year"), at("month") - 1, at("day"), at("hour") % 24, at("minute"), at("second"));
  return asIfUtc - utcMs;
}

/**
 * The moment a local date ("2026-09-19") and a minutes-from-midnight time mean
 * in the shop's timezone. Resolved twice so it stays right on the day the
 * clocks change.
 */
export function shopTime(dateISO: string, minutes: number, timeZone = DEFAULT_SHOP_TIMEZONE): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  const wallClock = Date.UTC(y, m - 1, d) + minutes * MINUTE;
  const firstGuess = wallClock - zoneOffsetMs(wallClock, timeZone);
  return wallClock - zoneOffsetMs(firstGuess, timeZone);
}

/** Day of the week (0 = Sunday) as the shop sees it. */
export function shopWeekday(utcMs: number, timeZone = DEFAULT_SHOP_TIMEZONE): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(new Date(utcMs));
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

/** The shop's local date ("2026-09-19") for a moment in time. */
export function shopDateISO(utcMs: number, timeZone = DEFAULT_SHOP_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(utcMs));
  return parts;
}

export interface DayHours {
  weekday: number;
  startMinute: number;
  endMinute: number;
  isOpen?: boolean;
  isWorking?: boolean;
}

/**
 * The working window for one day: the barber's own hours where they have them,
 * otherwise the shop's. Null when either is shut.
 */
export function workingWindow(
  dateISO: string,
  shopHours: DayHours[],
  barberHours: DayHours[],
  timeZone = DEFAULT_SHOP_TIMEZONE
): Interval | null {
  const weekday = shopWeekday(shopTime(dateISO, 12 * 60, timeZone), timeZone);
  const shopDay = shopHours.find((h) => h.weekday === weekday);
  if (!shopDay || shopDay.isOpen === false) return null;

  const barberDay = barberHours.find((h) => h.weekday === weekday);
  if (barberDay && barberDay.isWorking === false) return null;

  // A barber may start later or finish earlier than the shop, never outside it.
  const startMinute = Math.max(shopDay.startMinute, barberDay?.startMinute ?? shopDay.startMinute);
  const endMinute = Math.min(shopDay.endMinute, barberDay?.endMinute ?? shopDay.endMinute);
  if (endMinute <= startMinute) return null;

  return {
    start: shopTime(dateISO, startMinute, timeZone),
    end: shopTime(dateISO, endMinute, timeZone),
  };
}

/**
 * Statuses that hold the chair — including the ones already served, since that
 * time was genuinely used. A cancelled or no-show slot frees up again.
 */
export const BLOCKING_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "CHECKED_IN",
  "IN_PROGRESS",
  "COMPLETED",
  "COMPLETED_UNPAID",
] as const;

export function isBlocking(status: string): boolean {
  return (BLOCKING_STATUSES as readonly string[]).includes(status);
}
