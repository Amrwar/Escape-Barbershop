/**
 * Loyalty: the paper punch card, without the paper.
 *
 * A customer earns a stamp for every visit they pay for, and after however many
 * the shop decides, a reward is waiting. Two things this deliberately does not
 * do:
 *
 *  - It never changes a price. Like an offer, a reward is a notice at the till;
 *    the cashier decides what to charge and the receipt records what was taken.
 *    The money stays a record of what happened, not of what was promised.
 *  - It never counts anything but a paid visit. A booking, a no-show, or a visit
 *    someone walked out of without paying earns nothing.
 */

export interface LoyaltySettings {
  enabled: boolean;
  /** Stamps needed for one reward. */
  visitsRequired: number;
  rewardText: string;
  rewardTextAr: string | null;
}

export const DEFAULT_LOYALTY_SETTINGS: LoyaltySettings = {
  enabled: false,
  visitsRequired: 6,
  rewardText: "A free haircut",
  rewardTextAr: null,
};

export interface LoyaltyStanding {
  /** Paid visits counted so far. */
  visits: number;
  /** Rewards this many visits have earned, over the customer's whole history. */
  earned: number;
  redeemed: number;
  /** Earned but not yet given: what the till should mention. */
  available: number;
  /** Stamps on the card in hand, 0 up to one below the target. */
  stamps: number;
  /** Visits still to go before the next reward. */
  toNext: number;
}

/** Sane whatever the settings row says: a card of zero visits would never end. */
export function visitsRequired(settings: LoyaltySettings): number {
  return Math.max(1, Math.floor(settings.visitsRequired));
}

export function standing(visits: number, redeemed: number, settings: LoyaltySettings): LoyaltyStanding {
  const required = visitsRequired(settings);
  const counted = Math.max(0, Math.floor(visits));
  const earned = Math.floor(counted / required);
  const given = Math.max(0, Math.floor(redeemed));

  return {
    visits: counted,
    earned,
    redeemed: given,
    // A reward given by hand that was never earned is the shop's business, not
    // a debt the customer owes: never below zero.
    available: Math.max(0, earned - given),
    stamps: counted % required,
    toNext: required - (counted % required),
  };
}

/**
 * The line the till shows: how close they are, in words the cashier can read
 * aloud. Null when loyalty is off, so the screen has nothing to show.
 */
export function standingText(standing: LoyaltyStanding, settings: LoyaltySettings, lang: "en" | "ar" = "en"): string | null {
  if (!settings.enabled) return null;

  const reward = (lang === "ar" && settings.rewardTextAr) || settings.rewardText;
  if (standing.available > 0) {
    return lang === "ar" ? `مكافأة جاهزة: ${reward}` : `Reward ready: ${reward}`;
  }

  return lang === "ar"
    ? `${standing.stamps} من ${visitsRequired(settings)} — باقي ${standing.toNext} زيارة`
    : `${standing.stamps} of ${visitsRequired(settings)} — ${standing.toNext} more to go`;
}
