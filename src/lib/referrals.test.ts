import { describe, expect, it } from "vitest";
import { canReward, makeCode, normaliseCode, referralStanding, referralText } from "./referrals";

describe("the code itself", () => {
  it("is six characters a person can read across a counter", () => {
    const code = makeCode(() => 0.5);
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[A-Z0-9]+$/);
  });

  it("leaves out the characters people mistake for each other", () => {
    // Every character the generator can produce, over the whole alphabet.
    const produced = new Set<string>();
    for (let i = 0; i < 200; i++) produced.add(makeCode(() => i / 200)[0]);
    for (const confusing of ["0", "O", "1", "I", "L", "5", "S"]) {
      expect(produced.has(confusing)).toBe(false);
    }
  });

  it("forgives how somebody writes it down", () => {
    expect(normaliseCode(" a7k-m2 q ")).toBe("A7KM2Q");
    expect(normaliseCode("a7km2q")).toBe(normaliseCode("A7KM2Q"));
  });
});

describe("where a customer stands", () => {
  const rewarded = (referredId: string) => ({ referredId, rewardGivenAt: new Date() });
  const pending = (referredId: string) => ({ referredId, rewardGivenAt: null });

  it("counts a friend who signed up but has not been in", () => {
    const standing = referralStanding([pending("friend")], { friend: 0 });
    expect(standing).toEqual({ invited: 1, earned: 0, waiting: 0, rewarded: 0 });
  });

  it("earns the reward on the friend's first paid visit", () => {
    const standing = referralStanding([pending("friend")], { friend: 1 });
    expect(standing).toEqual({ invited: 1, earned: 1, waiting: 1, rewarded: 0 });
  });

  it("stops owing once the reward has been given", () => {
    const standing = referralStanding([rewarded("friend")], { friend: 3 });
    expect(standing).toEqual({ invited: 1, earned: 1, waiting: 0, rewarded: 1 });
  });

  it("adds up several friends at once", () => {
    const standing = referralStanding([pending("a"), pending("b"), rewarded("c")], { a: 2, b: 0, c: 1 });
    expect(standing).toMatchObject({ invited: 3, earned: 2, waiting: 1, rewarded: 1 });
  });

  it("never turns a generous shop into a debt owed back", () => {
    // Rewarded, then that visit was removed: nothing is owing either way.
    expect(referralStanding([rewarded("a")], { a: 0 }).waiting).toBe(0);
  });
});

describe("may this one be rewarded", () => {
  it("not until the friend has paid for something", () => {
    expect(canReward({ referredId: "a", rewardGivenAt: null }, 0)).toBe(false);
    expect(canReward({ referredId: "a", rewardGivenAt: null }, 1)).toBe(true);
  });

  it("and never twice", () => {
    expect(canReward({ referredId: "a", rewardGivenAt: new Date() }, 5)).toBe(false);
  });
});

describe("what the till says", () => {
  it("says nothing when nothing is owed", () => {
    expect(referralText({ invited: 3, earned: 1, waiting: 0, rewarded: 1 }, "A free beard trim")).toBeNull();
  });

  it("names the reward, and how many are waiting", () => {
    expect(referralText({ invited: 3, earned: 2, waiting: 2, rewarded: 0 }, "A free beard trim")).toBe(
      "Referral reward ready (2): A free beard trim"
    );
  });
});
