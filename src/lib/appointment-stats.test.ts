import { describe, it, expect } from 'vitest';
import { noShowRate, summariseDiary, type CountedAppointment } from './appointment-stats';

function appointment(overrides: Partial<CountedAppointment> = {}): CountedAppointment {
  return { status: 'CONFIRMED', source: 'PHONE', totalPrice: 100, ...overrides };
}

describe('summariseDiary', () => {
  it('counts an empty day as nothing at all', () => {
    const s = summariseDiary([]);
    expect(s.total).toBe(0);
    expect(s.expectedTakings).toBe(0);
  });

  it('separates bookings from walk-ins, and marks which came from the app', () => {
    const s = summariseDiary([
      appointment({ source: 'PHONE' }),
      appointment({ source: 'ONLINE' }),
      appointment({ source: 'WALK_IN' }),
      appointment({ source: 'STAFF' }),
    ]);
    expect(s.total).toBe(4);
    expect(s.booked).toBe(3);
    expect(s.walkIns).toBe(1);
    expect(s.online).toBe(1);
  });

  it('leaves a cancelled appointment out of the day, but still counts it', () => {
    const s = summariseDiary([appointment(), appointment({ status: 'CANCELLED' })]);
    expect(s.total).toBe(1);
    expect(s.cancelled).toBe(1);
    expect(s.expectedTakings).toBe(100);
  });

  it('splits the money by what happened to each appointment', () => {
    const s = summariseDiary([
      appointment({ status: 'CONFIRMED', totalPrice: 100 }),
      appointment({ status: 'CHECKED_IN', totalPrice: 50 }),
      appointment({ status: 'IN_PROGRESS', totalPrice: 70 }),
      appointment({ status: 'COMPLETED', totalPrice: 200 }),
      appointment({ status: 'COMPLETED_UNPAID', totalPrice: 30 }),
      appointment({ status: 'NO_SHOW', totalPrice: 90 }),
    ]);
    expect(s.open).toBe(3);
    expect(s.waiting).toBe(1);
    expect(s.inChair).toBe(1);
    expect(s.expectedTakings).toBe(220);
    expect(s.completed).toBe(1);
    expect(s.servedTakings).toBe(200);
    expect(s.unpaid).toBe(1);
    expect(s.unpaidTakings).toBe(30);
    expect(s.noShows).toBe(1);
    expect(s.missedTakings).toBe(90);
  });
});

describe('noShowRate', () => {
  it('is nothing before anyone has been served', () => {
    expect(noShowRate(summariseDiary([appointment()]))).toBe(0);
  });

  it('measures the misses against the appointments already judged', () => {
    const s = summariseDiary([
      appointment({ status: 'COMPLETED' }),
      appointment({ status: 'COMPLETED' }),
      appointment({ status: 'COMPLETED' }),
      appointment({ status: 'NO_SHOW' }),
      appointment({ status: 'CONFIRMED' }), // still to come, so not judged yet
    ]);
    expect(noShowRate(s)).toBe(25);
  });
});
