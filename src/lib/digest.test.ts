import { describe, expect, it } from "vitest";
import { digestMessage, worthSending, type DayNumbers } from "./digest";

const day = (overrides: Partial<DayNumbers> = {}): DayNumbers => ({
  visits: 12,
  takings: 3600,
  cash: 2000,
  card: 1100,
  instapay: 500,
  noShows: 1,
  noShowValue: 300,
  tomorrow: 7,
  ...overrides,
});

describe("whether to wake the phone at all", () => {
  it("sends on a day the shop did something", () => {
    expect(worthSending(day())).toBe(true);
  });

  it("sends on a dead day that still has bookings tomorrow", () => {
    expect(worthSending(day({ visits: 0, noShows: 0, takings: 0 }))).toBe(true);
  });

  it("stays quiet on a day with nothing at all — a closed day is not news", () => {
    expect(worthSending(day({ visits: 0, noShows: 0, tomorrow: 0, takings: 0 }))).toBe(false);
  });
});

describe("what it says", () => {
  it("leads with the takings and the count", () => {
    const message = digestMessage(day(), "2026-09-17");
    expect(message.title).toBe("Today at Escape");
    expect(message.body.split("\n")[0]).toBe("3,600 EGP from 12 visits");
  });

  it("splits the takings by how they were paid", () => {
    expect(digestMessage(day(), "2026-09-17").body).toContain("2,000 cash · 1,100 card · 500 InstaPay");
  });

  it("leaves out an account nothing came through", () => {
    const body = digestMessage(day({ instapay: 0, card: 0 }), "2026-09-17").body;
    expect(body).toContain("2,000 cash");
    expect(body).not.toContain("InstaPay");
    expect(body).not.toContain("card");
  });

  it("names what the no-shows cost, and says nothing when there were none", () => {
    expect(digestMessage(day(), "2026-09-17").body).toContain("1 no-show (300 EGP)");
    expect(digestMessage(day({ noShows: 0 }), "2026-09-17").body).not.toContain("no-show");
  });

  it("counts one visit as a visit, not as visits", () => {
    expect(digestMessage(day({ visits: 1 }), "2026-09-17").body).toContain("from 1 visit");
  });

  it("always ends on tomorrow, empty or not", () => {
    expect(digestMessage(day(), "2026-09-17").body.trim().endsWith("Tomorrow: 7 booked")).toBe(true);
    expect(digestMessage(day({ tomorrow: 0 }), "2026-09-17").body).toContain("Tomorrow: nothing booked yet");
  });

  it("goes to the insight screen when tapped, and cannot arrive twice for one day", () => {
    const message = digestMessage(day(), "2026-09-17");
    expect(message.url).toBe("/reports/insights");
    expect(message.tag).toBe("digest-2026-09-17");
  });

  it("speaks Arabic to an Arabic shop", () => {
    const body = digestMessage(day(), "2026-09-17", "ar").body;
    expect(body).toContain("زيارة");
    expect(body).toContain("غداً");
  });
});
