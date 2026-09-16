import { describe, it, expect } from 'vitest';
import {
  MINUTE,
  availableSlots,
  isBlocking,
  mergeIntervals,
  overlaps,
  shopDateISO,
  shopTime,
  shopWeekday,
  withBuffer,
  workingWindow,
} from './booking';

const TZ = 'Africa/Cairo';
/** A day window from a local date, e.g. 10:00–14:00 on 19 Sep 2026. */
const window = (dateISO: string, fromMinute: number, toMinute: number) => ({
  start: shopTime(dateISO, fromMinute, TZ),
  end: shopTime(dateISO, toMinute, TZ),
});
/** Slot start times read back as shop-local "HH:MM", which is how a customer sees them. */
const asClock = (slots: number[]) =>
  slots.map((s) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(s))
  );
const at = (dateISO: string, minute: number) => shopTime(dateISO, minute, TZ);

describe('overlaps', () => {
  it('counts a shared minute but not a touching end', () => {
    expect(overlaps({ start: 0, end: 10 }, { start: 9, end: 20 })).toBe(true);
    expect(overlaps({ start: 0, end: 10 }, { start: 10, end: 20 })).toBe(false);
  });
});

describe('mergeIntervals', () => {
  it('joins overlapping and touching spans, and drops empty ones', () => {
    expect(mergeIntervals([
      { start: 30, end: 40 },
      { start: 0, end: 10 },
      { start: 10, end: 20 },
      { start: 50, end: 50 },
    ])).toEqual([{ start: 0, end: 20 }, { start: 30, end: 40 }]);
  });
});

describe('withBuffer', () => {
  it('widens each busy span on both sides', () => {
    expect(withBuffer([{ start: 60 * MINUTE, end: 90 * MINUTE }], 10)).toEqual([
      { start: 50 * MINUTE, end: 100 * MINUTE },
    ]);
  });
});

describe('availableSlots', () => {
  const day = '2026-09-19';

  it('offers every slot on an empty day, and never runs past closing', () => {
    const slots = availableSlots({ window: window(day, 600, 720), durationMinutes: 30, slotMinutes: 15 });
    expect(asClock(slots)).toEqual(['10:00', '10:15', '10:30', '10:45', '11:00', '11:15', '11:30']);
  });

  it('hides the times an existing appointment covers', () => {
    const slots = availableSlots({
      window: window(day, 600, 720),
      durationMinutes: 30,
      slotMinutes: 30,
      busy: [{ start: at(day, 630), end: at(day, 660) }],
    });
    expect(asClock(slots)).toEqual(['10:00', '11:00', '11:30']);
  });

  it('keeps the buffer clear around a booking', () => {
    const slots = availableSlots({
      window: window(day, 600, 720),
      durationMinutes: 30,
      slotMinutes: 30,
      bufferMinutes: 15,
      busy: [{ start: at(day, 630), end: at(day, 660) }],
    });
    // The 10:30 booking blocks 10:15–11:15 once the buffer is added, and starts
    // stay on the half-hour grid, so 11:30 is the first one left.
    expect(asClock(slots)).toEqual(['11:30']);
  });

  it('will not squeeze a long service into a short gap', () => {
    const slots = availableSlots({
      window: window(day, 600, 720),
      durationMinutes: 45,
      slotMinutes: 15,
      busy: [
        { start: at(day, 600), end: at(day, 630) },
        { start: at(day, 660), end: at(day, 720) },
      ],
    });
    expect(asClock(slots)).toEqual([]);
  });

  it('drops times inside the notice period but keeps the grid tidy', () => {
    const slots = availableSlots({
      window: window(day, 600, 720),
      durationMinutes: 30,
      slotMinutes: 15,
      earliestStart: at(day, 622),
    });
    expect(asClock(slots)[0]).toBe('10:30');
  });

  it('gives nothing back for a service with no length', () => {
    expect(availableSlots({ window: window(day, 600, 720), durationMinutes: 0 })).toEqual([]);
  });
});

describe('shop timezone handling', () => {
  it('reads a local opening time as the right moment in summer and in winter', () => {
    // Cairo runs on UTC+3 in September and UTC+2 in January.
    expect(new Date(shopTime('2026-09-19', 600, TZ)).toISOString()).toBe('2026-09-19T07:00:00.000Z');
    expect(new Date(shopTime('2026-01-10', 600, TZ)).toISOString()).toBe('2026-01-10T08:00:00.000Z');
  });

  it('knows the shop weekday and date of a moment', () => {
    expect(shopWeekday(shopTime('2026-09-19', 600, TZ), TZ)).toBe(6); // Saturday
    expect(shopDateISO(shopTime('2026-09-19', 30, TZ), TZ)).toBe('2026-09-19');
  });
});

describe('workingWindow', () => {
  const shopHours = [{ weekday: 6, startMinute: 600, endMinute: 1320 }];

  it('uses the shop hours when the barber has none of their own', () => {
    const w = workingWindow('2026-09-19', shopHours, [], TZ);
    expect(asClock([w!.start, w!.end])).toEqual(['10:00', '22:00']);
  });

  it('narrows to the barber hours, never widens past the shop', () => {
    const w = workingWindow('2026-09-19', shopHours, [{ weekday: 6, startMinute: 540, endMinute: 900 }], TZ);
    expect(asClock([w!.start, w!.end])).toEqual(['10:00', '15:00']);
  });

  it('is closed when the shop is shut, or the barber is off', () => {
    expect(workingWindow('2026-09-20', shopHours, [], TZ)).toBeNull();
    expect(workingWindow('2026-09-19', shopHours, [{ weekday: 6, startMinute: 0, endMinute: 0, isWorking: false }], TZ)).toBeNull();
  });
});

describe('isBlocking', () => {
  it('holds the chair until the appointment is called off', () => {
    expect(isBlocking('CONFIRMED')).toBe(true);
    expect(isBlocking('IN_PROGRESS')).toBe(true);
    expect(isBlocking('CANCELLED')).toBe(false);
    expect(isBlocking('NO_SHOW')).toBe(false);
  });
});
