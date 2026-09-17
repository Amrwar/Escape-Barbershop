/**
 * Reviews: who may leave one, and what a pile of them adds up to.
 *
 * The rules are small and deliberately strict. A review is about a haircut that
 * happened, so only a finished appointment can carry one — including one the
 * customer left without paying, because they still sat in the chair and still
 * have an opinion. Cancelled and missed appointments are silent by design, and
 * so is anything still in the future.
 */

export const MIN_RATING = 1;
export const MAX_RATING = 5;

/** How long after the visit a customer may still say what they thought. */
export const REVIEW_WINDOW_DAYS = 30;

const DAY = 86_400_000;

/** Finished, one way or the other: the customer was served. */
const REVIEWABLE_STATUSES = ["COMPLETED", "COMPLETED_UNPAID"] as const;

export interface ReviewableAppointment {
  status: string;
  endAt: Date | string;
}

export interface RatingLike {
  rating: number;
}

/** A rating the customer could actually have meant: a whole 1 to 5. */
export function isValidRating(rating: number): boolean {
  return Number.isInteger(rating) && rating >= MIN_RATING && rating <= MAX_RATING;
}

/**
 * May this appointment be reviewed right now?
 *
 * The window exists so the app does not ask someone in March what they thought
 * of a haircut in January — an answer nobody trusts, about a barber who may have
 * changed everything since.
 */
export function canReview(appointment: ReviewableAppointment, now: number = Date.now()): boolean {
  if (!REVIEWABLE_STATUSES.includes(appointment.status as (typeof REVIEWABLE_STATUSES)[number])) return false;

  const end = new Date(appointment.endAt).getTime();
  if (Number.isNaN(end)) return false;
  if (end > now) return false;

  return now - end <= REVIEW_WINDOW_DAYS * DAY;
}

/** How long after a visit it is still natural to ask what they thought. */
export const ASK_WITHIN_HOURS = 30;

/**
 * Should we ask this customer what they thought?
 *
 * Only about a haircut that happened, only once, and only while it is fresh —
 * the nightly run picks these up the evening after the visit. Somebody who has
 * already reviewed it is never asked, and somebody who ignored the ask is never
 * asked again.
 */
export function shouldAskForReview(
  appointment: ReviewableAppointment & { reviewAskedAt?: Date | string | null; review?: unknown },
  now: number = Date.now()
): boolean {
  if (appointment.reviewAskedAt) return false;
  if (appointment.review) return false;
  if (!canReview(appointment, now)) return false;

  const end = new Date(appointment.endAt).getTime();
  return now - end <= ASK_WITHIN_HOURS * 3_600_000;
}

export interface RatingSummary {
  /** Null when nobody has said anything yet — not zero, which reads as "terrible". */
  average: number | null;
  count: number;
}

/** The average, to one decimal, and how many it rests on. */
export function ratingSummary(reviews: RatingLike[]): RatingSummary {
  const ratings = reviews.map((r) => r.rating).filter(isValidRating);
  if (ratings.length === 0) return { average: null, count: 0 };

  const total = ratings.reduce((sum, r) => sum + r, 0);
  return { average: Math.round((total / ratings.length) * 10) / 10, count: ratings.length };
}

/**
 * Summaries per barber, for the list of barbers in the app.
 * A barber nobody has reviewed is absent from the map, not zero-rated.
 */
export function ratingsByBarber(reviews: { barberId: string | null; rating: number }[]): Record<string, RatingSummary> {
  const grouped: Record<string, RatingLike[]> = {};
  for (const review of reviews) {
    if (!review.barberId) continue;
    (grouped[review.barberId] ??= []).push(review);
  }

  const out: Record<string, RatingSummary> = {};
  for (const barberId of Object.keys(grouped)) out[barberId] = ratingSummary(grouped[barberId]);
  return out;
}

/**
 * Five slots, filled from the left: ["full","full","full","half","empty"].
 * Kept here rather than in the component so the stars on a barber's profile and
 * the stars on a review can never drift apart.
 */
export type Star = "full" | "half" | "empty";

export function stars(average: number | null): Star[] {
  const value = average ?? 0;
  return Array.from({ length: MAX_RATING }, (_, i) => {
    const filled = value - i;
    if (filled >= 0.75) return "full";
    if (filled >= 0.25) return "half";
    return "empty";
  });
}
