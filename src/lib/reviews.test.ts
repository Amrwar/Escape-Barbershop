import { describe, expect, it } from "vitest";
import {
  canReview,
  isValidRating,
  ratingSummary,
  ratingsByBarber,
  shouldAskForReview,
  stars,
  REVIEW_WINDOW_DAYS,
} from "./reviews";

const DAY = 86_400_000;
const NOW = new Date("2026-09-16T12:00:00Z").getTime();
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000);

describe("who may leave a review", () => {
  it("lets a customer review a haircut they have had", () => {
    expect(canReview({ status: "COMPLETED", endAt: hoursAgo(2) }, NOW)).toBe(true);
  });

  it("lets them review one they left without paying — they still had the haircut", () => {
    expect(canReview({ status: "COMPLETED_UNPAID", endAt: hoursAgo(2) }, NOW)).toBe(true);
  });

  it("says nothing about a haircut that has not happened yet", () => {
    expect(canReview({ status: "CONFIRMED", endAt: new Date(NOW + 2 * 3_600_000) }, NOW)).toBe(false);
    // Even a finished-looking one cannot be reviewed before it ends.
    expect(canReview({ status: "COMPLETED", endAt: new Date(NOW + 60_000) }, NOW)).toBe(false);
  });

  it("refuses one that was called off or missed", () => {
    expect(canReview({ status: "CANCELLED", endAt: hoursAgo(2) }, NOW)).toBe(false);
    expect(canReview({ status: "NO_SHOW", endAt: hoursAgo(2) }, NOW)).toBe(false);
  });

  it("closes the window a month later", () => {
    const justInside = new Date(NOW - REVIEW_WINDOW_DAYS * DAY + 60_000);
    const justOutside = new Date(NOW - REVIEW_WINDOW_DAYS * DAY - 60_000);
    expect(canReview({ status: "COMPLETED", endAt: justInside }, NOW)).toBe(true);
    expect(canReview({ status: "COMPLETED", endAt: justOutside }, NOW)).toBe(false);
  });
});

describe("who gets asked what they thought", () => {
  const yesterday = { status: "COMPLETED", endAt: hoursAgo(20), reviewAskedAt: null, review: null };

  it("asks about a haircut they had yesterday", () => {
    expect(shouldAskForReview(yesterday, NOW)).toBe(true);
  });

  it("never asks twice", () => {
    expect(shouldAskForReview({ ...yesterday, reviewAskedAt: hoursAgo(2) }, NOW)).toBe(false);
  });

  it("does not ask somebody who has already said", () => {
    expect(shouldAskForReview({ ...yesterday, review: { rating: 5 } }, NOW)).toBe(false);
  });

  it("lets it go once the visit is stale", () => {
    expect(shouldAskForReview({ ...yesterday, endAt: hoursAgo(40) }, NOW)).toBe(false);
  });

  it("says nothing about a haircut that was cancelled or missed", () => {
    expect(shouldAskForReview({ ...yesterday, status: "CANCELLED" }, NOW)).toBe(false);
    expect(shouldAskForReview({ ...yesterday, status: "NO_SHOW" }, NOW)).toBe(false);
  });
});

describe("a rating the customer could have meant", () => {
  it("takes the whole numbers one to five", () => {
    expect([1, 2, 3, 4, 5].every(isValidRating)).toBe(true);
  });

  it("refuses zero, six, halves and nonsense", () => {
    expect([0, 6, 4.5, -1, NaN].some(isValidRating)).toBe(false);
  });
});

describe("what the ratings add up to", () => {
  it("averages to one decimal", () => {
    expect(ratingSummary([{ rating: 5 }, { rating: 4 }, { rating: 4 }])).toEqual({ average: 4.3, count: 3 });
  });

  it("has no average at all when nobody has said anything", () => {
    // Null, not zero: an unrated barber is unknown, not terrible.
    expect(ratingSummary([])).toEqual({ average: null, count: 0 });
  });

  it("ignores a rating that could not have been meant", () => {
    expect(ratingSummary([{ rating: 5 }, { rating: 9 }])).toEqual({ average: 5, count: 1 });
  });

  it("keeps each barber's reviews to themselves, and leaves out the unrated", () => {
    const summaries = ratingsByBarber([
      { barberId: "abdullah", rating: 5 },
      { barberId: "abdullah", rating: 4 },
      { barberId: "kareem", rating: 3 },
      { barberId: null, rating: 1 },
    ]);
    expect(summaries.abdullah).toEqual({ average: 4.5, count: 2 });
    expect(summaries.kareem).toEqual({ average: 3, count: 1 });
    expect(Object.keys(summaries)).toHaveLength(2);
  });
});

describe("the stars themselves", () => {
  it("fills from the left, and halves the middle one", () => {
    expect(stars(4.5)).toEqual(["full", "full", "full", "full", "half"]);
    expect(stars(3)).toEqual(["full", "full", "full", "empty", "empty"]);
  });

  it("shows five empty stars when there is no rating", () => {
    expect(stars(null)).toEqual(["empty", "empty", "empty", "empty", "empty"]);
  });

  it("rounds to the nearer half rather than flattering", () => {
    expect(stars(4.2)).toEqual(["full", "full", "full", "full", "empty"]);
    expect(stars(4.3)).toEqual(["full", "full", "full", "full", "half"]);
  });
});
