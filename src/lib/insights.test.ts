import { describe, expect, it } from "vitest";
import { barberShares, byDay, byHour, byWeekday, newVersusReturning, retention } from "./insights";

/** Shop time, so the buckets are the ones the shop would recognise. */
const at = (iso: string) => new Date(iso);
const visit = (customerId: string, visitAt: string, total = 150, barberId: string | null = "abdullah") => ({
  customerId,
  barberId,
  visitAt: at(visitAt),
  total,
});

describe("first-timers against regulars", () => {
  it("counts a visit as new only when it is that customer's first ever", () => {
    const visits = [visit("a", "2026-09-01T12:00:00Z"), visit("a", "2026-09-10T12:00:00Z"), visit("b", "2026-09-05T12:00:00Z")];
    const first = { a: at("2026-09-01T12:00:00Z"), b: at("2026-09-05T12:00:00Z") };

    expect(newVersusReturning(visits, first)).toEqual({ fresh: 2, returning: 1, freshPercent: 66.7 });
  });

  it("does not call an old customer new just because the window starts late", () => {
    // Their first visit was long before this month.
    const visits = [visit("a", "2026-09-10T12:00:00Z")];
    const first = { a: at("2025-01-04T12:00:00Z") };

    expect(newVersusReturning(visits, first)).toEqual({ fresh: 0, returning: 1, freshPercent: 0 });
  });

  it("says nothing rather than dividing by nothing", () => {
    expect(newVersusReturning([], {})).toEqual({ fresh: 0, returning: 0, freshPercent: 0 });
  });
});

describe("when the shop is busy", () => {
  it("buckets by the shop's own weekday", () => {
    // 2026-09-12 is a Saturday in Cairo; 22:00 UTC is still Saturday there (+3).
    const days = byWeekday([visit("a", "2026-09-12T13:00:00Z"), visit("b", "2026-09-12T19:00:00Z")]);
    expect(days[6]).toEqual({ key: 6, visits: 2, takings: 300 });
    expect(days[0].visits).toBe(0);
  });

  it("puts a late visit on the shop's clock, not the server's", () => {
    // 21:30 UTC is 00:30 in Cairo, the next day.
    const hours = byHour([visit("a", "2026-09-12T21:30:00Z")]);
    expect(hours[0].visits).toBe(1);
    expect(hours[21].visits).toBe(0);
  });

  it("adds the takings up alongside the count", () => {
    const hours = byHour([visit("a", "2026-09-12T14:00:00Z", 200), visit("b", "2026-09-12T14:30:00Z", 100)]);
    expect(hours[17]).toEqual({ key: 17, visits: 2, takings: 300 });
  });
});

describe("who did the work", () => {
  it("splits the takings by barber, biggest first", () => {
    const shares = barberShares([
      visit("a", "2026-09-12T12:00:00Z", 100, "abdullah"),
      visit("b", "2026-09-12T13:00:00Z", 300, "khaled"),
      visit("c", "2026-09-12T14:00:00Z", 100, "abdullah"),
    ]);

    expect(shares[0]).toEqual({ barberId: "khaled", visits: 1, takings: 300, average: 300, share: 60 });
    expect(shares[1]).toEqual({ barberId: "abdullah", visits: 2, takings: 200, average: 100, share: 40 });
  });

  it("leaves out a visit nobody was credited with", () => {
    expect(barberShares([visit("a", "2026-09-12T12:00:00Z", 100, null)])).toHaveLength(0);
  });
});

describe("whether people come back", () => {
  const NOW = new Date("2026-09-16T12:00:00Z").getTime();
  const daysAgo = (d: number) => new Date(NOW - d * 86_400_000);

  it("counts the regulars and the one-offs", () => {
    const result = retention({ a: [daysAgo(60), daysAgo(20)], b: [daysAgo(30)], c: [daysAgo(90), daysAgo(45), daysAgo(5)] }, NOW);
    expect(result.customers).toBe(3);
    expect(result.repeatCustomers).toBe(2);
    expect(result.repeatPercent).toBe(66.7);
  });

  it("gives the typical gap between visits, not the average dragged by one straggler", () => {
    const result = retention({ a: [daysAgo(100), daysAgo(90)], b: [daysAgo(60), daysAgo(50)], c: [daysAgo(400), daysAgo(10)] }, NOW);
    // Gaps are 10, 10 and 390 days: the middle one is what a shop recognises.
    expect(result.medianGapDays).toBe(10);
  });

  it("names the regulars who have stopped coming", () => {
    const result = retention({ lapsed: [daysAgo(200), daysAgo(120)], current: [daysAgo(70), daysAgo(9)] }, NOW);
    expect(result.slipping).toEqual(["lapsed"]);
  });

  it("does not call a one-time customer lapsed — they were never a regular", () => {
    expect(retention({ once: [daysAgo(300)] }, NOW).slipping).toHaveLength(0);
  });

  it("has no median to give from a shop with no repeat visits", () => {
    expect(retention({ a: [daysAgo(5)] }, NOW).medianGapDays).toBeNull();
  });
});

describe("day by day", () => {
  it("adds each shop day up, in order", () => {
    const days = byDay([
      visit("a", "2026-09-12T13:00:00Z", 100),
      visit("b", "2026-09-12T14:00:00Z", 50),
      visit("c", "2026-09-13T13:00:00Z", 200),
    ]);
    expect(days).toEqual([
      { date: "2026-09-12", visits: 2, takings: 150 },
      { date: "2026-09-13", visits: 1, takings: 200 },
    ]);
  });
});
