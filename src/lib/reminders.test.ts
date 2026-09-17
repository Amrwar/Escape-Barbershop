import { describe, it, expect } from 'vitest';
import { bookingConfirmedMessage, dueForReminder, reminderMessage, shouldRemind } from './reminders';

const now = Date.UTC(2026, 8, 20, 9, 0, 0); // 12:00 in Cairo
const hours = (n: number) => new Date(now + n * 3_600_000);

const appointment = (overrides: Partial<Parameters<typeof shouldRemind>[0]> = {}) => ({
  id: 'a1',
  startAt: hours(18),
  status: 'CONFIRMED',
  reminderSentAt: null,
  ...overrides,
});

describe('shouldRemind', () => {
  it('reminds about a booking inside the window', () => {
    expect(shouldRemind(appointment(), now)).toBe(true);
  });

  it('leaves one that is still too far off', () => {
    expect(shouldRemind(appointment({ startAt: hours(30) }), now)).toBe(false);
  });

  it('never reminds twice', () => {
    expect(shouldRemind(appointment({ reminderSentAt: hours(-2) }), now)).toBe(false);
  });

  it('says nothing about one that has already started or passed', () => {
    expect(shouldRemind(appointment({ startAt: hours(-1) }), now)).toBe(false);
    expect(shouldRemind(appointment({ startAt: new Date(now) }), now)).toBe(false);
  });

  it('stays quiet about anything called off or already dealt with', () => {
    for (const status of ['CANCELLED', 'NO_SHOW', 'COMPLETED', 'COMPLETED_UNPAID', 'CHECKED_IN', 'IN_PROGRESS']) {
      expect(shouldRemind(appointment({ status }), now), status).toBe(false);
    }
  });

  it('respects a shop that reminds further ahead', () => {
    expect(shouldRemind(appointment({ startAt: hours(30) }), now, 48)).toBe(true);
  });
});

describe('dueForReminder', () => {
  it('picks out only the ones worth a message', () => {
    const due = dueForReminder(
      [
        appointment({ id: 'soon' }),
        appointment({ id: 'far', startAt: hours(40) }),
        appointment({ id: 'done', status: 'COMPLETED' }),
        appointment({ id: 'already', reminderSentAt: hours(-1) }),
      ],
      now
    );
    expect(due.map((a) => a.id)).toEqual(['soon']);
  });
});

describe('what the message says', () => {
  const details = { id: 'a1', startAt: new Date(Date.UTC(2026, 8, 21, 11, 30)), barberName: 'Abdullah', services: ['Hair cut', 'Beard cut'] };

  it('confirms a booking with the day, the time and the barber', () => {
    const message = bookingConfirmedMessage(details, 'en');
    expect(message.title).toBe('Booking confirmed');
    expect(message.body).toContain('Abdullah');
    expect(message.body).toContain('Hair cut + Beard cut');
    expect(message.body).toContain('2:30'); // 11:30 UTC is 14:30 in Cairo
    expect(message.url).toBe('/app/appointments');
  });

  it('reminds in the language the customer reads', () => {
    const message = reminderMessage(details, 'ar');
    expect(message.title).toContain('تذكير');
    expect(message.body).toContain('Abdullah');
  });

  it('copes with a booking that has no barber named', () => {
    const message = reminderMessage({ ...details, barberName: null }, 'en');
    expect(message.body).not.toContain('with');
  });

  it('tags each message so a second one replaces the first', () => {
    expect(reminderMessage(details).tag).toBe('remind-a1');
    expect(bookingConfirmedMessage(details).tag).toBe('booked-a1');
  });
});
