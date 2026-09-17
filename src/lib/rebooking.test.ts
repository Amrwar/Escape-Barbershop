import { describe, expect, it } from "vitest";
import { DEFAULT_NUDGE_RULES, dueForNudge, dueTonight, nudgeMessage, rhythmOf, type Regular } from "./rebooking";

const NOW = new Date("2026-09-17T12:00:00Z").getTime();
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000);

/** Somebody who comes every 28 days and is now 40 days out. */
const regular = (overrides: Partial<Regular> = {}): Regular => ({
  customerId: "omar",
  visits: [daysAgo(96), daysAgo(68), daysAgo(40)],
  hasUpcoming: false,
  nudgedAt: null,
  ...overrides,
});

describe("their own rhythm", () => {
  it("is the typical gap between visits", () => {
    expect(rhythmOf([daysAgo(90), daysAgo(60), daysAgo(30)])).toBe(30);
  });

  it("takes the middle gap, so one long absence does not stretch it", () => {
    // Gaps of 30, 30 and 300 days: the shop's sense of them is 30.
    expect(rhythmOf([daysAgo(390), daysAgo(90), daysAgo(60), daysAgo(30)])).toBe(30);
  });

  it("cannot be read from a single visit", () => {
    expect(rhythmOf([daysAgo(30)])).toBeNull();
    expect(rhythmOf([])).toBeNull();
  });
});

describe("who is late by their own standard", () => {
  it("writes to a regular who is past their gap and the grace on top", () => {
    const due = dueForNudge(regular(), NOW);
    expect(due).toMatchObject({ customerId: "omar", rhythmDays: 28, sinceDays: 40 });
  });

  it("leaves them alone while they are merely due", () => {
    // 30 days out on a 28-day rhythm: inside the week of grace.
    expect(dueForNudge(regular({ visits: [daysAgo(86), daysAgo(58), daysAgo(30)] }), NOW)).toBeNull();
  });

  it("says nothing to somebody who already has an appointment", () => {
    expect(dueForNudge(regular({ hasUpcoming: true }), NOW)).toBeNull();
  });

  it("does not presume a rhythm from two visits", () => {
    expect(dueForNudge(regular({ visits: [daysAgo(68), daysAgo(40)] }), NOW)).toBeNull();
  });

  it("gives up on somebody who has clearly left", () => {
    // 200 days out on a 28-day rhythm is not forgetfulness.
    expect(dueForNudge(regular({ visits: [daysAgo(256), daysAgo(228), daysAgo(200)] }), NOW)).toBeNull();
  });

  it("never writes twice in a season", () => {
    expect(dueForNudge(regular({ nudgedAt: daysAgo(20) }), NOW)).toBeNull();
    // ...but the season does end.
    expect(dueForNudge(regular({ nudgedAt: daysAgo(100) }), NOW)).toBeTruthy();
  });

  it("takes the shop's own thresholds when it has them", () => {
    const patient = { ...DEFAULT_NUDGE_RULES, graceDays: 30 };
    expect(dueForNudge(regular(), NOW, patient)).toBeNull();
  });
});

describe("tonight's list", () => {
  const late = (id: string, days: number): Regular => ({
    customerId: id,
    visits: [daysAgo(days + 56), daysAgo(days + 28), daysAgo(days)],
    hasUpcoming: false,
    nudgedAt: null,
  });

  it("puts the longest overdue first", () => {
    const list = dueTonight([late("a", 40), late("b", 60), late("c", 45)], NOW);
    expect(list.map((d) => d.customerId)).toEqual(["b", "c", "a"]);
  });

  it("holds back the rest rather than messaging a hundred people at once", () => {
    const many = Array.from({ length: 40 }, (_, i) => late(`c${i}`, 40 + i));
    expect(dueTonight(many, NOW, DEFAULT_NUDGE_RULES, 25)).toHaveLength(25);
  });

  it("writes to nobody when nobody is late", () => {
    expect(dueTonight([regular({ hasUpcoming: true })], NOW)).toHaveLength(0);
  });
});

describe("what it says", () => {
  const due = { customerId: "omar", rhythmDays: 28, sinceDays: 40 };

  it("counts their weeks and names their barber", () => {
    const message = nudgeMessage(due, "Abdullah");
    expect(message.title).toBe("It has been a while");
    expect(message.body).toBe("6 weeks since your last cut with Abdullah. Your usual is one tap away.");
  });

  it("manages without a barber's name", () => {
    expect(nudgeMessage(due, null).body).toContain("6 weeks since your last visit");
  });

  it("lands on the home screen, where the usual is waiting", () => {
    expect(nudgeMessage(due, "Abdullah").url).toBe("/app");
  });

  it("speaks Arabic when the app does", () => {
    expect(nudgeMessage(due, "عبدالله", "ar").body).toContain("عبدالله");
  });
});
