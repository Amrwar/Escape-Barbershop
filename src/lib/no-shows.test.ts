import { describe, expect, it } from "vitest";
import { countingMisses, DEFAULT_NO_SHOW_POLICY, mustPayUpFront, standing } from "./no-shows";

const NOW = new Date("2026-09-17T12:00:00Z").getTime();
const daysAgo = (days: number) => ({ startAt: new Date(NOW - days * 86_400_000) });
const policy = (overrides = {}) => ({ ...DEFAULT_NO_SHOW_POLICY, enabled: true, ...overrides });

describe("which misses still count", () => {
  it("counts the recent ones", () => {
    expect(countingMisses([daysAgo(5), daysAgo(30)], null, NOW, policy())).toBe(2);
  });

  it("forgets one older than the window", () => {
    expect(countingMisses([daysAgo(5), daysAgo(200)], null, NOW, policy())).toBe(1);
  });

  it("forgets everything the shop has forgiven", () => {
    // Wiped the slate a week ago: only what happened since counts.
    const forgiven = new Date(NOW - 7 * 86_400_000);
    expect(countingMisses([daysAgo(30), daysAgo(20)], forgiven, NOW, policy())).toBe(0);
    expect(countingMisses([daysAgo(30), daysAgo(3)], forgiven, NOW, policy())).toBe(1);
  });

  it("counts nothing for somebody who has never missed", () => {
    expect(countingMisses([], null, NOW, policy())).toBe(0);
  });
});

describe("who is asked for money up front", () => {
  it("nobody at all while the shop has not turned it on", () => {
    expect(mustPayUpFront([daysAgo(1), daysAgo(2), daysAgo(3)], null, NOW, DEFAULT_NO_SHOW_POLICY)).toBe(false);
  });

  it("nobody who has missed once", () => {
    expect(mustPayUpFront([daysAgo(5)], null, NOW, policy())).toBe(false);
  });

  it("somebody who has missed twice", () => {
    expect(mustPayUpFront([daysAgo(5), daysAgo(20)], null, NOW, policy())).toBe(true);
  });

  it("not once those misses have aged out", () => {
    expect(mustPayUpFront([daysAgo(200), daysAgo(300)], null, NOW, policy())).toBe(false);
  });

  it("not once the shop has forgiven them", () => {
    const forgiven = new Date(NOW - 86_400_000);
    expect(mustPayUpFront([daysAgo(5), daysAgo(20)], forgiven, NOW, policy())).toBe(false);
  });

  it("takes the shop's own count when it has one", () => {
    expect(mustPayUpFront([daysAgo(5)], null, NOW, policy({ allowed: 1 }))).toBe(true);
    expect(mustPayUpFront([daysAgo(5), daysAgo(6)], null, NOW, policy({ allowed: 5 }))).toBe(false);
  });
});

describe("what the shop's screen says", () => {
  it("counts the misses and whether they matter yet", () => {
    expect(standing([daysAgo(5)], null, NOW, policy())).toEqual({ misses: 1, askForDeposit: false, allowed: 2 });
    expect(standing([daysAgo(5), daysAgo(9)], null, NOW, policy())).toEqual({
      misses: 2,
      askForDeposit: true,
      allowed: 2,
    });
  });

  it("still counts the misses while the policy is off, but asks for nothing", () => {
    const off = standing([daysAgo(5), daysAgo(9)], null, NOW, DEFAULT_NO_SHOW_POLICY);
    expect(off.misses).toBe(2);
    expect(off.askForDeposit).toBe(false);
  });
});
