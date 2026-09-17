/**
 * "It has been a while."
 *
 * Every regular has a rhythm — three weeks, five weeks — and the shop already
 * works it out for the insight screens. This uses each customer's own rhythm to
 * notice when they are late, and says so once.
 *
 * The whole design problem here is restraint. A shop that messages people who
 * did not ask to be messaged loses them, and loses their notifications for ever
 * along with them. So: only customers who come back by habit, only after their
 * own gap has passed, never while they already have something booked, never
 * twice in a season, and never at all once they have clearly stopped coming —
 * somebody eight months gone is not late, they have left, and that is a
 * different conversation.
 */

export interface Regular {
  customerId: string;
  /** Every visit they have paid for, in any order. */
  visits: (Date | string)[];
  /** Do they already have something in the diary? */
  hasUpcoming: boolean;
  /** When they were last nudged, if ever. */
  nudgedAt?: Date | string | null;
}

export interface NudgeRules {
  /** Visits before the shop presumes to know their rhythm. */
  visitsForRhythm: number;
  /** Days past their own gap before they count as late. */
  graceDays: number;
  /** Beyond this many days late, they have left rather than forgotten. */
  giveUpAfterDays: number;
  /** Never nudge the same person twice inside this. */
  quietDays: number;
}

export const DEFAULT_NUDGE_RULES: NudgeRules = {
  visitsForRhythm: 3,
  graceDays: 7,
  giveUpAfterDays: 60,
  quietDays: 90,
};

const DAY = 86_400_000;
const time = (value: Date | string) => new Date(value).getTime();

/** The typical gap between one visit and the next, in days. */
export function rhythmOf(visits: (Date | string)[]): number | null {
  const days = visits.map(time).sort((a, b) => a - b);
  if (days.length < 2) return null;

  const gaps: number[] = [];
  for (let i = 1; i < days.length; i++) gaps.push((days[i] - days[i - 1]) / DAY);

  gaps.sort((a, b) => a - b);
  const middle = Math.floor(gaps.length / 2);
  const median = gaps.length % 2 === 1 ? gaps[middle] : (gaps[middle - 1] + gaps[middle]) / 2;

  return Math.round(median * 10) / 10;
}

export interface Due {
  customerId: string;
  /** Their own gap, in days — what the message can honestly refer to. */
  rhythmDays: number;
  /** How long since they were last in. */
  sinceDays: number;
}

/**
 * Is this customer late by their own standard, and fair to write to?
 *
 * Returns the numbers when they are, so the message can use their rhythm rather
 * than a number the shop invented.
 */
export function dueForNudge(
  regular: Regular,
  now: number = Date.now(),
  rules: NudgeRules = DEFAULT_NUDGE_RULES
): Due | null {
  if (regular.hasUpcoming) return null;
  if (regular.visits.length < rules.visitsForRhythm) return null;

  const rhythm = rhythmOf(regular.visits);
  if (rhythm === null || rhythm <= 0) return null;

  const last = Math.max(...regular.visits.map(time));
  const since = (now - last) / DAY;

  // Early: their next one is not due yet.
  if (since < rhythm + rules.graceDays) return null;
  // Gone: this is a lapsed customer, not a forgetful one.
  if (since > rhythm + rules.graceDays + rules.giveUpAfterDays) return null;

  if (regular.nudgedAt && (now - time(regular.nudgedAt)) / DAY < rules.quietDays) return null;

  return {
    customerId: regular.customerId,
    rhythmDays: Math.round(rhythm),
    sinceDays: Math.floor(since),
  };
}

/** Who to write to tonight, the longest overdue first, and never more than `cap`. */
export function dueTonight(
  regulars: Regular[],
  now: number = Date.now(),
  rules: NudgeRules = DEFAULT_NUDGE_RULES,
  cap = 25
): Due[] {
  return regulars
    .map((regular) => dueForNudge(regular, now, rules))
    .filter((due): due is Due => due !== null)
    .sort((a, b) => b.sinceDays - a.sinceDays)
    .slice(0, cap);
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/**
 * What it says. Their barber's name if the shop knows it, their own number of
 * weeks, and no pressure — the tap goes to the home screen, where "the usual"
 * is waiting with times.
 */
export function nudgeMessage(
  due: Due,
  barberName: string | null,
  lang: "en" | "ar" = "en"
): PushMessage {
  const weeks = Math.max(1, Math.round(due.sinceDays / 7));

  if (lang === "ar") {
    return {
      title: "مر وقت طويل",
      body: barberName
        ? `${weeks} أسابيع على آخر حلاقة مع ${barberName}. احجز موعدك بضغطة.`
        : `${weeks} أسابيع على آخر زيارة. احجز موعدك بضغطة.`,
      url: "/app",
      tag: `nudge-${due.customerId}`,
    };
  }

  return {
    title: "It has been a while",
    body: barberName
      ? `${weeks} weeks since your last cut with ${barberName}. Your usual is one tap away.`
      : `${weeks} weeks since your last visit. Your usual is one tap away.`,
    url: "/app",
    tag: `nudge-${due.customerId}`,
  };
}
