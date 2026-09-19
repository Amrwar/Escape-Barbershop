/**
 * What a customer always has.
 *
 * A regular books the same thing every time: the same barber, the same cut, at
 * roughly the same hour. Making them choose it again from the top is four taps
 * of nothing. This reads it out of their own history so the app can offer it
 * back in one.
 *
 * Read from both halves of their history. A booked cut is an appointment and
 * knows what was asked for; a walk-in is a visit and knows what was paid for.
 * Preferring appointments alone was the tidier rule and the wrong one here —
 * this shop's regulars have walked in for years without booking once, so it
 * read every one of them as having no habit at all.
 *
 * Only cuts they actually sat through count. A cancelled booking says nothing
 * about what somebody usually has; a visit only exists because it happened.
 */

export interface PastAppointment {
  startAt: Date | string;
  status: string;
  barberId: string | null;
  serviceIds: string[];
}

const SERVED = ["COMPLETED", "COMPLETED_UNPAID"];

/** Enough history to call something "usual" rather than "the last thing". */
export const VISITS_FOR_A_HABIT = 2;

export interface Usual {
  barberId: string | null;
  serviceIds: string[];
  /** Their usual hour of the day, in shop time, 0–23. */
  hour: number;
  /** How many served appointments this was read from. */
  from: number;
}

const time = (value: Date | string) => new Date(value).getTime();

/** Most common, and on a tie the one they had most recently. */
function favourite<T>(items: { value: T; at: number }[], key: (value: T) => string): T | null {
  const counts: Record<string, { count: number; latest: number; value: T }> = {};
  for (const item of items) {
    const id = key(item.value);
    const row = (counts[id] ??= { count: 0, latest: 0, value: item.value });
    row.count += 1;
    row.latest = Math.max(row.latest, item.at);
  }

  const ranked = Object.values(counts).sort((a, b) => b.count - a.count || b.latest - a.latest);
  return ranked[0]?.value ?? null;
}

/**
 * What to offer them, or null when there is no habit to read yet.
 *
 * `timeZone` matters: the hour has to be the one they would say out loud, which
 * is the shop's hour and not the server's.
 */
export function usualFor(appointments: PastAppointment[], timeZone = "Africa/Cairo"): Usual | null {
  const served = appointments
    .filter((a) => SERVED.includes(a.status) && a.serviceIds.length > 0)
    .sort((a, b) => time(b.startAt) - time(a.startAt));

  if (served.length < VISITS_FOR_A_HABIT) return null;

  // Recent habits beat old ones: a barber who left, or a cut they have moved on
  // from, should not follow them around for ever.
  const recent = served.slice(0, 6);

  const barberId = favourite(
    recent.filter((a) => a.barberId).map((a) => ({ value: a.barberId as string, at: time(a.startAt) })),
    (id) => id
  );

  const serviceIds = favourite(
    recent.map((a) => ({ value: [...a.serviceIds].sort(), at: time(a.startAt) })),
    (ids) => ids.join("+")
  );

  if (!serviceIds || serviceIds.length === 0) return null;

  const hours = recent.map((a) =>
    Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hour12: false }).format(new Date(a.startAt)))
  );
  // The middle hour, so one odd early morning does not move it.
  hours.sort((a, b) => a - b);
  const hour = hours[Math.floor(hours.length / 2)];

  return { barberId, serviceIds, hour: Number.isFinite(hour) ? hour % 24 : 12, from: served.length };
}

/**
 * Out of the free times on a day, the ones nearest the hour they usually come —
 * closest first, so the app can offer three without making them scroll.
 */
export function nearestTimes(slots: (Date | string)[], hour: number, timeZone = "Africa/Cairo", take = 3): string[] {
  const minutesFromUsual = (slot: Date | string) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(slot));
    const [h, m] = parts.split(":").map(Number);
    return Math.abs(h * 60 + m - hour * 60);
  };

  return [...slots]
    .sort((a, b) => minutesFromUsual(a) - minutesFromUsual(b) || time(a) - time(b))
    .slice(0, take)
    .map((slot) => new Date(slot).toISOString());
}
