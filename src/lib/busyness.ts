import { shopWeekday } from "./booking";

/**
 * "Is it worth walking down now?"
 *
 * The honest answer has two sources, and which one is available depends on how
 * the shop is working that day.
 *
 * The **live** answer — who is in a chair, who is waiting — is better, but it
 * only exists when the shop is running the queue screen. A shop that rings
 * walk-ins straight through the till has an empty queue all day, and a live
 * wait read off that would say "no wait" at six on a Thursday, which is a lie
 * told confidently.
 *
 * So this is the other source: what actually happened, at this hour, on this
 * weekday, over the past few months. It is a forecast and it says so. It is
 * never dressed up as a live number.
 */

export interface BusySample {
  visitAt: Date | string;
}

export type BusyLevel = "quiet" | "steady" | "busy";

export interface Busyness {
  level: BusyLevel;
  /** Cuts in this hour on an average such day, to one decimal. */
  perHour: number;
  /** How this hour compares with the shop's own average open hour: 1 is typical. */
  relative: number;
  /** How many past weeks this rests on. Below `WEEKS_FOR_A_PATTERN` it is null. */
  fromWeeks: number;
}

/** Fewer than this and the shape is noise, not a pattern. */
export const WEEKS_FOR_A_PATTERN = 3;

/** Above and below the shop's own average hour, rather than any fixed count. */
const BUSY_AT = 1.25;
const QUIET_AT = 0.7;

const time = (value: Date | string) => new Date(value).getTime();

function hourIn(value: Date | string | number, timeZone: string): number {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hour12: false }).format(new Date(value))
  );
  return Number.isFinite(hour) ? hour % 24 : 0;
}

/**
 * How busy this hour usually is, measured against the shop's own average.
 *
 * Relative rather than absolute on purpose: "eleven cuts an hour" means nothing
 * without knowing the shop, but "half as busy as usual" means something to
 * anybody. A one-chair shop and a six-chair shop both read correctly.
 *
 * Returns null when there is not enough history to be worth showing — which is
 * the right answer far more often than a shrug dressed as data.
 */
export function typicalBusyness(
  visits: BusySample[],
  now: number = Date.now(),
  timeZone = "Africa/Cairo"
): Busyness | null {
  if (visits.length === 0) return null;

  const weekday = shopWeekday(now, timeZone);
  const hour = hourIn(now, timeZone);

  // Only whole weeks back from now, so a part-week does not drag an average down.
  const oldest = Math.min(...visits.map((v) => time(v.visitAt)));
  const weeks = Math.floor((now - oldest) / (7 * 86_400_000));
  if (weeks < WEEKS_FOR_A_PATTERN) return null;

  let thisHour = 0;
  let openHours = 0;
  const seenHours = new Set<string>();
  let total = 0;

  for (const visit of visits) {
    const at = time(visit.visitAt);
    if (!Number.isFinite(at) || at > now) continue;

    total += 1;
    const day = shopWeekday(at, timeZone);
    const h = hourIn(at, timeZone);

    // An hour the shop was actually open, counted once however many cuts it saw.
    const stamp = `${Math.floor(at / 86_400_000)}:${h}`;
    if (!seenHours.has(stamp)) {
      seenHours.add(stamp);
      openHours += 1;
    }

    if (day === weekday && h === hour) thisHour += 1;
  }

  if (total === 0 || openHours === 0) return null;

  const perHour = thisHour / weeks;
  const shopAverage = total / openHours;
  if (shopAverage === 0) return null;

  const relative = perHour / shopAverage;
  const level: BusyLevel = relative >= BUSY_AT ? "busy" : relative <= QUIET_AT ? "quiet" : "steady";

  return {
    level,
    perHour: Math.round(perHour * 10) / 10,
    relative: Math.round(relative * 100) / 100,
    fromWeeks: weeks,
  };
}

/**
 * The quieter hours around now, so somebody who can come later is told when.
 *
 * Only hours the shop is actually open and only ones meaningfully quieter than
 * right now — suggesting a time that is no better is worse than suggesting
 * nothing.
 */
export function quieterSoon(
  visits: BusySample[],
  now: number = Date.now(),
  timeZone = "Africa/Cairo",
  lookAheadHours = 5
): number[] {
  const weekday = shopWeekday(now, timeZone);
  const hour = hourIn(now, timeZone);

  const counts = new Map<number, number>();
  for (const visit of visits) {
    const at = time(visit.visitAt);
    if (!Number.isFinite(at) || at > now) continue;
    if (shopWeekday(at, timeZone) !== weekday) continue;
    const h = hourIn(at, timeZone);
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }

  const nowCount = counts.get(hour) ?? 0;
  if (nowCount === 0) return [];

  const quieter: number[] = [];
  for (let ahead = 1; ahead <= lookAheadHours; ahead++) {
    const h = (hour + ahead) % 24;
    const count = counts.get(h);
    // An hour with no history at all is closed, not quiet.
    if (count === undefined || count === 0) continue;
    if (count <= nowCount * QUIET_AT) quieter.push(h);
  }

  return quieter;
}
