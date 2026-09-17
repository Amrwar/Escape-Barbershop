import { describe, expect, it } from "vitest";
import { birthdayMessage, daysUntilBirthday, isBirthdayOn, shouldGreet, upcomingBirthdays } from "./birthdays";

/** Midday in Cairo on 16 September 2026. */
const NOON = new Date("2026-09-16T09:00:00Z").getTime();
/** Half past midnight in Cairo on the 17th — the same UTC day as the 16th. */
const AFTER_MIDNIGHT = new Date("2026-09-16T21:30:00Z").getTime();

const born = (iso: string) => new Date(iso);

describe("is it today", () => {
  it("matches the day and month, whatever the year", () => {
    expect(isBirthdayOn(born("1991-09-16T00:00:00Z"), NOON)).toBe(true);
    expect(isBirthdayOn(born("1991-09-17T00:00:00Z"), NOON)).toBe(false);
  });

  it("reads the date in shop time, not the server's", () => {
    // In Cairo it is already the 17th, so the 17th is today and the 16th is not.
    expect(isBirthdayOn(born("1990-09-17T00:00:00Z"), AFTER_MIDNIGHT)).toBe(true);
    expect(isBirthdayOn(born("1990-09-16T00:00:00Z"), AFTER_MIDNIGHT)).toBe(false);
  });

  it("greets somebody born on 29 February on the 28th in a common year", () => {
    const commonYear = new Date("2027-02-28T09:00:00Z").getTime();
    const leapYear = new Date("2028-02-28T09:00:00Z").getTime();
    expect(isBirthdayOn(born("2000-02-29T00:00:00Z"), commonYear)).toBe(true);
    // In a leap year they get their own day instead.
    expect(isBirthdayOn(born("2000-02-29T00:00:00Z"), leapYear)).toBe(false);
    expect(isBirthdayOn(born("2000-02-29T00:00:00Z"), new Date("2028-02-29T09:00:00Z").getTime())).toBe(true);
  });

  it("says no to somebody who never gave a birthday", () => {
    expect(isBirthdayOn(null, NOON)).toBe(false);
  });
});

describe("greeting them once a year", () => {
  const birthday = born("1991-09-16T00:00:00Z");

  it("greets somebody who has never been greeted", () => {
    expect(shouldGreet({ birthday, birthdayGreetedAt: null }, NOON)).toBe(true);
  });

  it("does not greet them twice in the same year", () => {
    expect(shouldGreet({ birthday, birthdayGreetedAt: new Date("2026-09-16T08:00:00Z") }, NOON)).toBe(false);
  });

  it("greets them again next year", () => {
    expect(shouldGreet({ birthday, birthdayGreetedAt: new Date("2025-09-16T08:00:00Z") }, NOON)).toBe(true);
  });

  it("says nothing on any other day", () => {
    const anotherDay = new Date("2026-05-02T09:00:00Z").getTime();
    expect(shouldGreet({ birthday, birthdayGreetedAt: null }, anotherDay)).toBe(false);
  });
});

describe("the ones coming up", () => {
  it("counts nothing for today", () => {
    expect(daysUntilBirthday(born("1991-09-16T00:00:00Z"), NOON)).toBe(0);
  });

  it("counts forward to the next one", () => {
    expect(daysUntilBirthday(born("1991-09-20T00:00:00Z"), NOON)).toBe(4);
  });

  it("rolls into next year once this year's has passed", () => {
    // 1 September is gone; the next one is nearly a year away.
    expect(daysUntilBirthday(born("1991-09-01T00:00:00Z"), NOON)).toBe(350);
  });

  it("lists the near ones first, and leaves the far ones out", () => {
    const people = [
      { name: "soon", birthday: born("1990-09-18T00:00:00Z") },
      { name: "today", birthday: born("1990-09-16T00:00:00Z") },
      { name: "far", birthday: born("1990-12-25T00:00:00Z") },
      { name: "unknown", birthday: null },
    ];

    const upcoming = upcomingBirthdays(people, 30, NOON);
    expect(upcoming.map((u) => u.person.name)).toEqual(["today", "soon"]);
    expect(upcoming[0].daysAway).toBe(0);
    expect(upcoming[1].daysAway).toBe(2);
  });
});

describe("the greeting", () => {
  it("uses their first name and the shop's own words", () => {
    const message = birthdayMessage("Ahmed Mohamed Samir", "A free beard trim this week");
    expect(message.title).toBe("Happy birthday, Ahmed! 🎉");
    expect(message.body).toBe("A free beard trim this week");
  });

  it("still says something warm when the shop wrote nothing", () => {
    expect(birthdayMessage("Ahmed", null).body).toBe("From everyone at Escape");
  });

  it("speaks Arabic to an Arabic app", () => {
    expect(birthdayMessage("Ahmed", null, "ar").title).toContain("كل سنة");
  });
});
