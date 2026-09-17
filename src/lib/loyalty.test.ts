import { describe, expect, it } from "vitest";
import { DEFAULT_LOYALTY_SETTINGS, standing, standingText, visitsRequired } from "./loyalty";

const card = (overrides: Partial<typeof DEFAULT_LOYALTY_SETTINGS> = {}) => ({
  ...DEFAULT_LOYALTY_SETTINGS,
  enabled: true,
  visitsRequired: 6,
  rewardText: "A free haircut",
  ...overrides,
});

describe("stamps on the card", () => {
  it("counts up towards the reward", () => {
    const s = standing(4, 0, card());
    expect(s.stamps).toBe(4);
    expect(s.toNext).toBe(2);
    expect(s.available).toBe(0);
  });

  it("earns a reward on the sixth visit, and starts a fresh card", () => {
    const s = standing(6, 0, card());
    expect(s.earned).toBe(1);
    expect(s.available).toBe(1);
    expect(s.stamps).toBe(0);
    expect(s.toNext).toBe(6);
  });

  it("keeps earning: two cards' worth is two rewards", () => {
    expect(standing(13, 0, card()).earned).toBe(2);
    expect(standing(13, 0, card()).stamps).toBe(1);
  });

  it("takes what has been given off what is waiting", () => {
    const s = standing(13, 1, card());
    expect(s.earned).toBe(2);
    expect(s.redeemed).toBe(1);
    expect(s.available).toBe(1);
  });

  it("never turns a generous shop into a customer's debt", () => {
    // A reward handed over before it was earned leaves nothing owing.
    expect(standing(2, 3, card()).available).toBe(0);
  });

  it("starts everyone at nothing", () => {
    const s = standing(0, 0, card());
    expect(s).toMatchObject({ visits: 0, earned: 0, available: 0, stamps: 0, toNext: 6 });
  });
});

describe("a card that would never end", () => {
  it("treats zero or nonsense as one visit per reward", () => {
    expect(visitsRequired(card({ visitsRequired: 0 }))).toBe(1);
    expect(visitsRequired(card({ visitsRequired: -4 }))).toBe(1);
    expect(standing(3, 0, card({ visitsRequired: 0 })).earned).toBe(3);
  });

  it("ignores a half-visit target", () => {
    expect(visitsRequired(card({ visitsRequired: 5.7 }))).toBe(5);
  });
});

describe("what the till says", () => {
  it("says nothing at all when loyalty is off", () => {
    expect(standingText(standing(5, 0, card()), card({ enabled: false }))).toBeNull();
  });

  it("calls out a reward that is waiting", () => {
    expect(standingText(standing(6, 0, card()), card())).toBe("Reward ready: A free haircut");
  });

  it("counts down otherwise", () => {
    expect(standingText(standing(4, 0, card()), card())).toBe("4 of 6 — 2 more to go");
  });

  it("speaks Arabic when the shop is in Arabic", () => {
    const settings = card({ rewardTextAr: "حلاقة مجاناً" });
    expect(standingText(standing(6, 0, settings), settings, "ar")).toBe("مكافأة جاهزة: حلاقة مجاناً");
    expect(standingText(standing(2, 0, settings), settings, "ar")).toContain("باقي 4");
  });

  it("falls back to the English reward when nobody wrote an Arabic one", () => {
    expect(standingText(standing(6, 0, card()), card(), "ar")).toContain("A free haircut");
  });
});
