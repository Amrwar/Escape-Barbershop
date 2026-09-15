import { describe, it, expect } from 'vitest';
import { IDLE_TIMEOUT_MS, MAX_SESSION_MS, isPastMaxSession, tokenLifetimeSeconds } from './session-policy';

const now = Date.UTC(2026, 8, 15, 12, 0, 0);

describe('isPastMaxSession', () => {
  it('keeps a login that is inside the cap', () => {
    expect(isPastMaxSession(now - MAX_SESSION_MS + 1000, now)).toBe(false);
  });

  it('ends a login that has reached the cap', () => {
    expect(isPastMaxSession(now - MAX_SESSION_MS, now)).toBe(true);
  });

  it('ends a token issued before logins carried a start time', () => {
    expect(isPastMaxSession(undefined, now)).toBe(true);
  });
});

describe('tokenLifetimeSeconds', () => {
  it('gives a fresh login the full idle window', () => {
    expect(tokenLifetimeSeconds(now, now)).toBe(IDLE_TIMEOUT_MS / 1000);
  });

  it('shortens the idle window near the cap', () => {
    expect(tokenLifetimeSeconds(now - MAX_SESSION_MS + 5 * 60 * 1000, now)).toBe(5 * 60);
  });

  it('never goes negative past the cap', () => {
    expect(tokenLifetimeSeconds(now - MAX_SESSION_MS - 1000, now)).toBe(0);
  });

  it('gives nothing to a token without a login time', () => {
    expect(tokenLifetimeSeconds(undefined, now)).toBe(0);
  });
});
