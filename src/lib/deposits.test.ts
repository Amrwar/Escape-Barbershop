import { describe, expect, it } from "vitest";
import {
  balanceAfterDeposit,
  depositFor,
  DEFAULT_DEPOSIT_POLICY,
  holdExpiry,
  holdLapsed,
  needsDeposit,
  referenceFor,
  summarise,
} from "./deposits";

const policy = (overrides = {}) => ({ ...DEFAULT_DEPOSIT_POLICY, enabled: true, ...overrides });

describe("who is asked for one", () => {
  it("nobody at all while the shop has not turned it on", () => {
    expect(needsDeposit(2000, { ...DEFAULT_DEPOSIT_POLICY, enabled: false })).toBe(false);
  });

  it("the expensive work, and not the ordinary haircut", () => {
    expect(needsDeposit(2000, policy({ threshold: 1000 }))).toBe(true);
    expect(needsDeposit(300, policy({ threshold: 1000 }))).toBe(false);
  });

  it("counts the threshold itself as expensive enough", () => {
    expect(needsDeposit(1000, policy({ threshold: 1000 }))).toBe(true);
  });
});

describe("how much", () => {
  it("is the shop's share of the price", () => {
    expect(depositFor(2000, policy({ percent: 25 }))).toBe(500);
  });

  it("is rounded to whole pounds, because somebody types it into a transfer", () => {
    expect(depositFor(1350, policy({ percent: 25 }))).toBe(338);
  });

  it("is nothing at all when none is asked for", () => {
    expect(depositFor(300, policy({ threshold: 1000 }))).toBe(0);
    expect(depositFor(2000, { ...DEFAULT_DEPOSIT_POLICY, enabled: false })).toBe(0);
  });

  it("never asks for more than the work costs, whatever the policy says", () => {
    expect(depositFor(2000, policy({ percent: 150 }))).toBe(2000);
  });
});

describe("the reference on the transfer", () => {
  it("is short, and tied to the booking", () => {
    expect(referenceFor("cmu4rad0t00011022zl596ays")).toBe("ESC-96AYS");
  });

  it("is the same every time it is asked for", () => {
    expect(referenceFor("abc123")).toBe(referenceFor("abc123"));
  });

  it("is different for different bookings", () => {
    expect(referenceFor("aaaaaaaaaa")).not.toBe(referenceFor("bbbbbbbbbb"));
  });
});

describe("how long the chair is held", () => {
  const bookedAt = new Date("2026-09-17T12:00:00Z");

  it("runs out after the hours the shop allows", () => {
    expect(holdExpiry(bookedAt, policy({ holdHours: 24 })).toISOString()).toBe("2026-09-18T12:00:00.000Z");
  });

  it("lapses once the time is up and the money never came", () => {
    const booking = { status: "PENDING", depositStatus: "EXPECTED" as const, holdUntil: bookedAt };
    expect(holdLapsed(booking, bookedAt.getTime() + 1000)).toBe(true);
    expect(holdLapsed(booking, bookedAt.getTime() - 1000)).toBe(false);
  });

  it("never lapses once the money is in — the chair is theirs", () => {
    const paid = { status: "CONFIRMED", depositStatus: "RECEIVED" as const, holdUntil: bookedAt };
    expect(holdLapsed(paid, bookedAt.getTime() + 86_400_000)).toBe(false);
  });

  it("leaves a cancelled or finished booking alone", () => {
    const base = { depositStatus: "EXPECTED" as const, holdUntil: bookedAt };
    expect(holdLapsed({ ...base, status: "CANCELLED" }, bookedAt.getTime() + 1000)).toBe(false);
    expect(holdLapsed({ ...base, status: "COMPLETED" }, bookedAt.getTime() + 1000)).toBe(false);
  });

  it("says nothing about a booking that never needed a deposit", () => {
    expect(holdLapsed({ status: "CONFIRMED" }, Date.now())).toBe(false);
  });
});

describe("what is left to pay at the till", () => {
  it("takes the deposit off once it has arrived", () => {
    expect(balanceAfterDeposit(2000, 500, "RECEIVED")).toBe(1500);
  });

  it("takes it off a visit that has already used it, so the screen reads the same", () => {
    expect(balanceAfterDeposit(2000, 500, "USED")).toBe(1500);
  });

  it("takes nothing off while the money has not come", () => {
    expect(balanceAfterDeposit(2000, 500, "EXPECTED")).toBe(2000);
  });

  it("takes nothing off a deposit that was given back", () => {
    expect(balanceAfterDeposit(2000, 500, "REFUNDED")).toBe(2000);
  });

  it("never goes below nothing, however generous the deposit was", () => {
    expect(balanceAfterDeposit(400, 500, "RECEIVED")).toBe(0);
  });
});

describe("what the shop is holding", () => {
  it("keeps money in hand apart from money already spent", () => {
    const summary = summarise([
      { amount: 500, status: "RECEIVED" },
      { amount: 300, status: "RECEIVED" },
      { amount: 250, status: "USED" },
      { amount: 400, status: "FORFEITED" },
      { amount: 100, status: "REFUNDED" },
      { amount: 900, status: "EXPECTED" },
    ]);

    expect(summary.held).toBe(800);
    expect(summary.used).toBe(250);
    expect(summary.forfeited).toBe(400);
    expect(summary.refunded).toBe(100);
    // Asked for, never sent: a hope rather than money.
    expect(summary.expected).toBe(900);
  });

  it("holds nothing when nothing has been taken", () => {
    expect(summarise([])).toMatchObject({ held: 0, used: 0, forfeited: 0 });
  });
});
