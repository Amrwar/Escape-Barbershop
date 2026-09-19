import { describe, expect, it } from "vitest";
import { quieterSoon, typicalBusyness, WEEKS_FOR_A_PATTERN, type BusySample } from "./busyness";

/**
 * "Is it worth walking down now?"
 *
 * The thing worth guarding is restraint: this must say nothing rather than
 * guess. A confident "no wait" read off thin history is worse than an empty
 * card, because somebody acts on it.
 */

const TZ = "Africa/Cairo";

/** A Wednesday, 18:00 Cairo, as the moment being asked about. */
const NOW = new Date("2026-09-16T15:00:00.000Z").getTime();

/** Cuts at a given Cairo hour, a given number of weeks back from NOW. */
function cuts(count: number, hourCairo: number, weeksAgo: number, dayShift = 0): BusySample[] {
  const base = NOW - weeksAgo * 7 * 86_400_000 + dayShift * 86_400_000;
  const day = new Date(base);
  // NOW is 18:00 Cairo == 15:00 UTC, so Cairo hour h is UTC h-3.
  day.setUTCHours(hourCairo - 3, 0, 0, 0);
  return Array.from({ length: count }, (_, i) => ({
    visitAt: new Date(day.getTime() + i * 60_000).toISOString(),
  }));
}

/** A shop with a long, even history, plus whatever the test piles on top. */
function history(extra: BusySample[] = []): BusySample[] {
  const rows: BusySample[] = [];
  for (let week = 1; week <= 10; week++) {
    for (let day = 0; day < 7; day++) {
      for (const hour of [12, 14, 16, 18, 20]) {
        rows.push(...cuts(2, hour, week, -day));
      }
    }
  }
  return [...rows, ...extra];
}

describe("saying nothing rather than guessing", () => {
  it("says nothing at all with no history", () => {
    expect(typicalBusyness([], NOW, TZ)).toBeNull();
  });

  it("says nothing until there are enough weeks to see a pattern", () => {
    const thin = cuts(40, 18, WEEKS_FOR_A_PATTERN - 1);
    expect(typicalBusyness(thin, NOW, TZ)).toBeNull();
  });

  it("speaks once the history is long enough", () => {
    expect(typicalBusyness(history(), NOW, TZ)).not.toBeNull();
  });

  it("never counts a visit from the future", () => {
    const ahead: BusySample[] = [{ visitAt: new Date(NOW + 86_400_000).toISOString() }];
    const withFuture = typicalBusyness(history(ahead), NOW, TZ);
    const without = typicalBusyness(history(), NOW, TZ);
    expect(withFuture).toEqual(without);
  });
});

describe("reading the hour", () => {
  it("calls an hour busy when it runs well above the shop's own average", () => {
    // Ten weeks of Wednesdays at 18:00, far heavier than any other hour.
    const heavy: BusySample[] = [];
    for (let week = 1; week <= 10; week++) heavy.push(...cuts(14, 18, week));

    const read = typicalBusyness(history(heavy), NOW, TZ);
    expect(read?.level).toBe("busy");
    expect(read!.relative).toBeGreaterThan(1.25);
  });

  it("calls it quiet when the hour is well below average", () => {
    // The even history has 2 cuts at 18:00; strip this weekday's 18:00 down.
    const rows = history().filter((r) => {
      const d = new Date(r.visitAt as string);
      return !(d.getUTCHours() === 15 && d.getUTCDay() === new Date(NOW).getUTCDay());
    });
    const read = typicalBusyness(rows, NOW, TZ);
    expect(read?.level).toBe("quiet");
  });

  it("is relative, so a small shop and a big one both read correctly", () => {
    const small = history();
    // The same shape, four times the volume: the level must not move.
    const big = small.flatMap((r) => [r, r, r, r]);

    expect(typicalBusyness(big, NOW, TZ)?.level).toBe(typicalBusyness(small, NOW, TZ)?.level);
  });

  it("reports what it rests on, so the screen can be honest about it", () => {
    const read = typicalBusyness(history(), NOW, TZ);
    expect(read!.fromWeeks).toBeGreaterThanOrEqual(WEEKS_FOR_A_PATTERN);
    expect(read!.perHour).toBeGreaterThan(0);
  });
});

describe("suggesting a quieter hour", () => {
  it("offers a later hour that is genuinely quieter", () => {
    const rows: BusySample[] = [];
    for (let week = 1; week <= 10; week++) {
      rows.push(...cuts(10, 18, week));
      rows.push(...cuts(1, 20, week));
    }
    expect(quieterSoon(rows, NOW, TZ)).toContain(20);
  });

  it("offers nothing when every later hour is just as busy", () => {
    const rows: BusySample[] = [];
    for (let week = 1; week <= 10; week++) {
      rows.push(...cuts(10, 18, week));
      rows.push(...cuts(10, 20, week));
    }
    expect(quieterSoon(rows, NOW, TZ)).toEqual([]);
  });

  it("does not call a closed hour quiet", () => {
    const rows: BusySample[] = [];
    // Busy at 18:00 and nothing ever after, because the shop has shut.
    for (let week = 1; week <= 10; week++) rows.push(...cuts(10, 18, week));

    expect(quieterSoon(rows, NOW, TZ)).toEqual([]);
  });

  it("says nothing when this hour has no history to compare against", () => {
    const rows: BusySample[] = [];
    for (let week = 1; week <= 10; week++) rows.push(...cuts(10, 11, week));

    expect(quieterSoon(rows, NOW, TZ)).toEqual([]);
  });
});
