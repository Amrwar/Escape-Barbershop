import { describe, it, expect } from 'vitest';
import { estimateWaits, type QueuedAppointment } from './queue';

const now = Date.UTC(2026, 8, 19, 12, 0, 0);
const inMinutes = (n: number) => new Date(now + n * 60_000);

function appointment(overrides: Partial<QueuedAppointment> = {}): QueuedAppointment {
  return { id: Math.random().toString(36).slice(2), durationMinutes: 30, barberId: null, endAt: inMinutes(0), ...overrides };
}

describe('estimateWaits', () => {
  it('sends the first customer straight in when no chair is busy', () => {
    const waits = estimateWaits([appointment()], [], now);
    expect(waits[0].waitMinutes).toBe(0);
    expect(waits[0].position).toBe(1);
  });

  it('waits for the chair that frees first', () => {
    const chairs = [
      appointment({ barberId: 'a', endAt: inMinutes(20) }),
      appointment({ barberId: 'b', endAt: inMinutes(5) }),
    ];
    const waits = estimateWaits([appointment()], chairs, now);
    expect(waits[0].waitMinutes).toBe(5);
  });

  it('queues the next customers behind the ones in front', () => {
    const chairs = [appointment({ barberId: 'a', endAt: inMinutes(10) })];
    const waiting = [appointment({ durationMinutes: 30 }), appointment({ durationMinutes: 20 }), appointment()];
    const waits = estimateWaits(waiting, chairs, now);
    expect(waits.map((w) => w.waitMinutes)).toEqual([10, 40, 60]);
    expect(waits.map((w) => w.position)).toEqual([1, 2, 3]);
  });

  it('shares the load across the chairs that are free soonest', () => {
    const chairs = [
      appointment({ barberId: 'a', endAt: inMinutes(10) }),
      appointment({ barberId: 'b', endAt: inMinutes(15) }),
    ];
    const waits = estimateWaits([appointment(), appointment()], chairs, now);
    expect(waits.map((w) => w.waitMinutes)).toEqual([10, 15]);
  });

  it('makes a customer who asked for one barber wait for that barber', () => {
    const chairs = [
      appointment({ barberId: 'busy', endAt: inMinutes(45) }),
      appointment({ barberId: 'free-soon', endAt: inMinutes(5) }),
    ];
    const waits = estimateWaits([appointment({ barberId: 'busy' })], chairs, now);
    expect(waits[0].waitMinutes).toBe(45);
  });

  it('never promises a negative wait when a chair has run over', () => {
    const chairs = [appointment({ barberId: 'a', endAt: inMinutes(-20) })];
    const waits = estimateWaits([appointment()], chairs, now);
    expect(waits[0].waitMinutes).toBe(0);
  });
});
