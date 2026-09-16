import { describe, it, expect } from 'vitest';
import { isRunning, offerState, savingOf } from './offers';

const now = Date.UTC(2026, 8, 20, 12, 0, 0);
const day = 86_400_000;

describe('isRunning', () => {
  it('shows an offer with no dates on it', () => {
    expect(isRunning({ isActive: true }, now)).toBe(true);
  });

  it('hides one that has been switched off, dates or not', () => {
    expect(isRunning({ isActive: false }, now)).toBe(false);
    expect(isRunning({ isActive: false, startsAt: new Date(now - day), endsAt: new Date(now + day) }, now)).toBe(false);
  });

  it('waits for the start date, and stops after the end', () => {
    expect(isRunning({ isActive: true, startsAt: new Date(now + day) }, now)).toBe(false);
    expect(isRunning({ isActive: true, endsAt: new Date(now - day) }, now)).toBe(false);
    expect(isRunning({ isActive: true, startsAt: new Date(now - day), endsAt: new Date(now + day) }, now)).toBe(true);
  });
});

describe('offerState', () => {
  it('reads the shop its own status back', () => {
    expect(offerState({ isActive: false }, now)).toBe('off');
    expect(offerState({ isActive: true, startsAt: new Date(now + day) }, now)).toBe('scheduled');
    expect(offerState({ isActive: true, endsAt: new Date(now - day) }, now)).toBe('finished');
    expect(offerState({ isActive: true }, now)).toBe('running');
  });
});

describe('savingOf', () => {
  it('works out the saving when both prices are given', () => {
    expect(savingOf({ price: 400, wasPrice: 450 })).toBe(50);
  });

  it('says nothing when there is nothing to compare, or nothing saved', () => {
    expect(savingOf({ price: 400 })).toBeNull();
    expect(savingOf({ wasPrice: 450 })).toBeNull();
    expect(savingOf({ price: 450, wasPrice: 450 })).toBeNull();
    expect(savingOf({ price: 500, wasPrice: 450 })).toBeNull();
  });
});
