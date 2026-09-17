import { shopDateISO } from "./booking";

/**
 * Birthdays.
 *
 * Only the day and the month are ever used — the year a customer gave is their
 * business, and the shop has no reason to work out anybody's age. Everything is
 * read in shop time, so a greeting goes out on the morning the customer would
 * call their birthday, not on whatever day it is in UTC.
 */

export interface BirthdayPerson {
  birthday: Date | string | null;
  /** When they were last wished a happy birthday, so it happens once a year. */
  birthdayGreetedAt?: Date | string | null;
}

/** Day and month, as the shop reads them. */
export function dayAndMonth(birthday: Date | string, timeZone?: string): { day: number; month: number } {
  const [, month, day] = shopDateISO(new Date(birthday).getTime(), timeZone).split("-").map(Number);
  return { day, month };
}

/** Is today the day, in the shop's own calendar? */
export function isBirthdayOn(birthday: Date | string | null, now: number = Date.now(), timeZone?: string): boolean {
  if (!birthday) return false;
  const theirs = dayAndMonth(birthday, timeZone);
  const today = dayAndMonth(new Date(now), timeZone);

  if (theirs.month === today.month && theirs.day === today.day) return true;

  // 29 February: greeted on the 28th in a year that has no 29th, rather than
  // skipped for three years out of four.
  if (theirs.month === 2 && theirs.day === 29 && today.month === 2 && today.day === 28) {
    const year = Number(shopDateISO(now, timeZone).slice(0, 4));
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return !isLeap;
  }

  return false;
}

/** Wish them once a year, and only on the day. */
export function shouldGreet(person: BirthdayPerson, now: number = Date.now(), timeZone?: string): boolean {
  if (!isBirthdayOn(person.birthday ?? null, now, timeZone)) return false;
  if (!person.birthdayGreetedAt) return true;

  // Same calendar year in shop time means it has already gone out.
  const greetedYear = shopDateISO(new Date(person.birthdayGreetedAt).getTime(), timeZone).slice(0, 4);
  return greetedYear !== shopDateISO(now, timeZone).slice(0, 4);
}

/**
 * How many days until the next one, 0 on the day itself. Used to list the
 * birthdays coming up, which is what a shop actually acts on.
 */
export function daysUntilBirthday(birthday: Date | string, now: number = Date.now(), timeZone?: string): number {
  const theirs = dayAndMonth(birthday, timeZone);
  const todayISO = shopDateISO(now, timeZone);
  const year = Number(todayISO.slice(0, 4));

  const startOfToday = Date.UTC(year, Number(todayISO.slice(5, 7)) - 1, Number(todayISO.slice(8, 10)));
  let next = Date.UTC(year, theirs.month - 1, theirs.day);
  if (next < startOfToday) next = Date.UTC(year + 1, theirs.month - 1, theirs.day);

  return Math.round((next - startOfToday) / 86_400_000);
}

export interface UpcomingBirthday<T> {
  person: T;
  daysAway: number;
}

/** Everyone with a birthday in the next `days` days, soonest first. */
export function upcomingBirthdays<T extends { birthday: Date | string | null }>(
  people: T[],
  days = 30,
  now: number = Date.now(),
  timeZone?: string
): UpcomingBirthday<T>[] {
  return people
    .filter((person) => person.birthday)
    .map((person) => ({ person, daysAway: daysUntilBirthday(person.birthday!, now, timeZone) }))
    .filter((row) => row.daysAway <= days)
    .sort((a, b) => a.daysAway - b.daysAway);
}

/** The greeting itself, in the shop's words or the default ones. */
export function birthdayMessage(name: string, offerText: string | null, lang: "en" | "ar" = "en") {
  const firstName = name.trim().split(/\s+/)[0];
  return lang === "ar"
    ? {
        title: `كل سنة وأنت طيب يا ${firstName}! 🎉`,
        body: offerText || "من كل القلب، من إسكيب",
        url: "/app",
        tag: "birthday",
      }
    : {
        title: `Happy birthday, ${firstName}! 🎉`,
        body: offerText || "From everyone at Escape",
        url: "/app",
        tag: "birthday",
      };
}
