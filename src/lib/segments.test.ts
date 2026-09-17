import { describe, expect, it } from "vitest";
import { DEFAULT_SEGMENT_RULES, inSegment, membersOf, segmentCounts, summarise } from "./segments";

const NOW = new Date("2026-09-16T12:00:00Z").getTime();
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000);

const visit = (customerId: string, days: number, total = 150) => ({
  customerId,
  visitAt: daysAgo(days),
  total,
});

const who = (rows: { customerId: string; visitAt: Date; total: number }[], id: string) =>
  summarise(rows).find((c) => c.customerId === id)!;

describe("reducing a history to what the rules need", () => {
  it("counts visits, spend, and the first and last day", () => {
    const rows = [visit("a", 100, 200), visit("a", 10, 300), visit("a", 50, 100)];
    const summary = who(rows, "a");

    expect(summary.visits).toBe(3);
    expect(summary.spend).toBe(600);
    expect(summary.firstVisitAt).toBe(daysAgo(100).getTime());
    expect(summary.lastVisitAt).toBe(daysAgo(10).getTime());
  });

  it("keeps one customer's history out of another's", () => {
    expect(summarise([visit("a", 5), visit("b", 5)])).toHaveLength(2);
  });
});

describe("the groups", () => {
  it("counts somebody whose first visit was recent as a newcomer", () => {
    expect(inSegment(who([visit("a", 20)], "a"), "newcomers", NOW)).toBe(true);
    // First came a year ago: not new, however often they come.
    expect(inSegment(who([visit("b", 365), visit("b", 3)], "b"), "newcomers", NOW)).toBe(false);
  });

  it("calls somebody a regular on their third visit, while they are still coming", () => {
    const regular = who([visit("a", 80), visit("a", 40), visit("a", 5)], "a");
    expect(inSegment(regular, "regulars", NOW)).toBe(true);

    const twice = who([visit("b", 40), visit("b", 5)], "b");
    expect(inSegment(twice, "regulars", NOW)).toBe(false);
  });

  it("stops calling a regular a regular once they have gone quiet", () => {
    const quiet = who([visit("a", 300), visit("a", 200), visit("a", 100)], "a");
    expect(inSegment(quiet, "regulars", NOW)).toBe(false);
    expect(inSegment(quiet, "slipping", NOW)).toBe(true);
  });

  it("keeps slipping and lapsed apart, so nobody is chased twice", () => {
    const slipping = who([visit("a", 200), visit("a", 90)], "a");
    const lapsed = who([visit("b", 500), visit("b", 300)], "b");

    expect(inSegment(slipping, "slipping", NOW)).toBe(true);
    expect(inSegment(slipping, "lapsed", NOW)).toBe(false);
    expect(inSegment(lapsed, "lapsed", NOW)).toBe(true);
    expect(inSegment(lapsed, "slipping", NOW)).toBe(false);
  });

  it("does not call somebody slipping who was never a repeat customer", () => {
    // One visit, long ago: that is the one-visit group, not a regular gone quiet.
    const once = who([visit("a", 120)], "a");
    expect(inSegment(once, "slipping", NOW)).toBe(false);
    expect(inSegment(once, "oneVisitOnly", NOW)).toBe(true);
  });

  it("gives a recent first-timer time before calling them a one-visit customer", () => {
    expect(inSegment(who([visit("a", 10)], "a"), "oneVisitOnly", NOW)).toBe(false);
  });

  it("counts lifetime spend for a big spender", () => {
    const big = who([visit("a", 40, 2000), visit("a", 10, 1500)], "a");
    expect(inSegment(big, "bigSpenders", NOW)).toBe(true);
    expect(inSegment(who([visit("b", 10, 150)], "b"), "bigSpenders", NOW)).toBe(false);
  });

  it("lets the groups overlap where the shop would want them to", () => {
    // A good customer who has gone quiet is both, and is exactly who to ring.
    const valuable = who([visit("a", 300, 2500), visit("a", 100, 2500)], "a");
    expect(inSegment(valuable, "bigSpenders", NOW)).toBe(true);
    expect(inSegment(valuable, "slipping", NOW)).toBe(true);
  });

  it("takes the shop's own thresholds when it has them", () => {
    const twice = who([visit("a", 40), visit("a", 5)], "a");
    expect(inSegment(twice, "regulars", NOW, { ...DEFAULT_SEGMENT_RULES, regularVisits: 2 })).toBe(true);
  });
});

describe("the lists themselves", () => {
  const rows = [
    visit("recent", 2),
    visit("older", 30),
    visit("older", 70),
    visit("gone", 400),
    visit("gone", 300),
  ];

  it("puts the most recently seen first", () => {
    const members = membersOf(summarise(rows), "newcomers", NOW);
    expect(members[0].customerId).toBe("recent");
  });

  it("counts every group at once, for the screen", () => {
    const counts = segmentCounts(summarise(rows), NOW);
    // Only "recent": "older" first came 70 days ago, past the newcomer line.
    expect(counts.newcomers).toBe(1);
    expect(counts.lapsed).toBe(1); // gone
    expect(counts.oneVisitOnly).toBe(0);
  });

  it("answers an empty shop with zeros rather than nothing", () => {
    const counts = segmentCounts([], NOW);
    expect(Object.values(counts).every((n) => n === 0)).toBe(true);
  });
});
