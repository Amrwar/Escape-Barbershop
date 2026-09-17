import { describe, expect, it } from "vitest";
import { claimable, nextInLine, offerExpiry, offerLapsed, offerMessage, suits, OFFER_MINUTES } from "./waitlist";

const NOW = new Date("2026-09-17T12:00:00Z").getTime();
const minutesAgo = (m: number) => new Date(NOW - m * 60_000);

const waiting = (overrides: Partial<Parameters<typeof suits>[0]> = {}) => ({
  id: "entry",
  customerId: "omar",
  dateISO: "2026-09-19",
  barberId: null as string | null,
  status: "WAITING",
  durationMinutes: 30,
  createdAt: minutesAgo(60),
  offerExpiresAt: null as Date | null,
  ...overrides,
});

const freed = (overrides: Partial<Parameters<typeof suits>[1]> = {}) => ({
  dateISO: "2026-09-19",
  startAt: new Date("2026-09-19T12:00:00Z"),
  minutes: 30,
  barberId: "abdullah" as string | null,
  ...overrides,
});

describe("whether a freed chair suits somebody", () => {
  it("suits a customer waiting on that day for that long", () => {
    expect(suits(waiting(), freed())).toBe(true);
  });

  it("does not suit a different day", () => {
    expect(suits(waiting({ dateISO: "2026-09-20" }), freed())).toBe(false);
  });

  it("does not suit work that will not fit in the gap", () => {
    expect(suits(waiting({ durationMinutes: 45 }), freed({ minutes: 30 }))).toBe(false);
    expect(suits(waiting({ durationMinutes: 30 }), freed({ minutes: 45 }))).toBe(true);
  });

  it("does not offer somebody else's chair to a customer who asked for a person", () => {
    expect(suits(waiting({ barberId: "khaled" }), freed({ barberId: "abdullah" }))).toBe(false);
    expect(suits(waiting({ barberId: "abdullah" }), freed({ barberId: "abdullah" }))).toBe(true);
  });

  it("suits anyone who asked for any barber", () => {
    expect(suits(waiting({ barberId: null }), freed({ barberId: "khaled" }))).toBe(true);
  });
});

describe("who gets offered it", () => {
  it("is the one who has waited longest", () => {
    const first = waiting({ id: "first", createdAt: minutesAgo(120) });
    const second = waiting({ id: "second", createdAt: minutesAgo(30) });

    expect(nextInLine([second, first], freed(), NOW)?.id).toBe("first");
  });

  it("skips somebody the slot does not suit, however long they have waited", () => {
    const wrongBarber = waiting({ id: "wrong", barberId: "khaled", createdAt: minutesAgo(300) });
    const right = waiting({ id: "right", barberId: "abdullah", createdAt: minutesAgo(10) });

    expect(nextInLine([wrongBarber, right], freed({ barberId: "abdullah" }), NOW)?.id).toBe("right");
  });

  it("does not offer the same slot to somebody already holding an offer", () => {
    const holding = waiting({
      id: "holding",
      status: "OFFERED",
      offerExpiresAt: new Date(NOW + 5 * 60_000),
      createdAt: minutesAgo(300),
    });
    const next = waiting({ id: "next", createdAt: minutesAgo(10) });

    expect(nextInLine([holding, next], freed(), NOW)?.id).toBe("next");
  });

  it("passes a lapsed offer on to the next in line", () => {
    const lapsed = waiting({
      id: "lapsed",
      status: "OFFERED",
      offerExpiresAt: new Date(NOW - 60_000),
      createdAt: minutesAgo(300),
    });
    const next = waiting({ id: "next", createdAt: minutesAgo(10) });

    // The one who let it lapse waited longest, so they come round again first.
    expect(nextInLine([lapsed, next], freed(), NOW)?.id).toBe("lapsed");
  });

  it("offers it to nobody when nobody is waiting for that day", () => {
    expect(nextInLine([waiting({ dateISO: "2026-10-01" })], freed(), NOW)).toBeNull();
    expect(nextInLine([], freed(), NOW)).toBeNull();
  });

  it("leaves out anybody who has already taken one or come off the list", () => {
    const taken = waiting({ id: "taken", status: "TAKEN", createdAt: minutesAgo(300) });
    const closed = waiting({ id: "closed", status: "CLOSED", createdAt: minutesAgo(200) });
    const next = waiting({ id: "next", createdAt: minutesAgo(10) });

    expect(nextInLine([taken, closed, next], freed(), NOW)?.id).toBe("next");
  });
});

describe("how long an offer stands", () => {
  it("runs out twenty minutes later", () => {
    expect(offerExpiry(NOW).getTime()).toBe(NOW + OFFER_MINUTES * 60_000);
  });

  it("knows when it has lapsed", () => {
    expect(offerLapsed(waiting({ status: "OFFERED", offerExpiresAt: new Date(NOW - 1) }), NOW)).toBe(true);
    expect(offerLapsed(waiting({ status: "OFFERED", offerExpiresAt: new Date(NOW + 60_000) }), NOW)).toBe(false);
  });

  it("says nothing about somebody who was never offered anything", () => {
    expect(offerLapsed(waiting(), NOW)).toBe(false);
  });
});

describe("taking the offer", () => {
  const offered = (overrides = {}) => ({
    ...waiting({ status: "OFFERED", offerExpiresAt: new Date(NOW + 10 * 60_000) }),
    offeredStartAt: new Date(NOW + 3 * 3_600_000),
    ...overrides,
  });

  it("can be taken while it stands and the slot is still ahead", () => {
    expect(claimable(offered(), NOW)).toBe(true);
  });

  it("cannot be taken once it has lapsed", () => {
    expect(claimable(offered({ offerExpiresAt: new Date(NOW - 1) }), NOW)).toBe(false);
  });

  it("cannot be taken for a time that has already passed", () => {
    expect(claimable(offered({ offeredStartAt: new Date(NOW - 60_000) }), NOW)).toBe(false);
  });

  it("cannot be taken by somebody who was never offered it", () => {
    expect(claimable({ ...waiting(), offeredStartAt: new Date(NOW + 3_600_000) }, NOW)).toBe(false);
  });
});

describe("the message", () => {
  it("names the time, the barber, and how long they have", () => {
    const message = offerMessage(freed(), "Abdullah");
    expect(message.title).toBe("A time has opened");
    expect(message.body).toContain("Abdullah");
    expect(message.body).toContain("20 minutes");
    expect(message.url).toBe("/app");
  });

  it("manages without a barber's name", () => {
    expect(offerMessage(freed({ barberId: null }), null).body).not.toContain("with");
  });

  it("speaks Arabic when the app does", () => {
    expect(offerMessage(freed(), "عبدالله", "ar").title).toBe("مكان فاضي!");
  });
});
