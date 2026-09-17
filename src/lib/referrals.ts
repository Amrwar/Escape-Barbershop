/**
 * "Tell a friend."
 *
 * A customer has a code; a new customer types it when they sign up; the shop
 * owes a reward once that new customer has actually paid for a haircut. Like
 * every other reward here, it is a notice at the till and never a price the
 * app changes by itself.
 *
 * Whether a referral has earned anything is worked out from the visits, so it
 * cannot drift: the only thing written down is what the shop handed over.
 */

/**
 * No 0/O, no 1/I/L: the code is read aloud across a counter and typed by
 * somebody who has never seen it written down.
 */
const ALPHABET = "ACDEFGHJKMNPQRTUVWXY2346789";
const CODE_LENGTH = 6;

/** What the shop or the customer typed, tidied into what we store. */
export function normaliseCode(raw: string): string {
  // Spaces, dashes and case are how people write a code down, not part of it.
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
}

/**
 * A fresh code. `random` is injectable so a test can pin it — and so the shop
 * can keep asking for another one if a code somehow collides.
 */
export function makeCode(random: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[Math.floor(random() * ALPHABET.length) % ALPHABET.length];
  }
  return code;
}

export interface ReferralRow {
  referredId: string;
  rewardGivenAt: Date | string | null;
}

export interface ReferralStanding {
  /** People who signed up with this customer's code. */
  invited: number;
  /** Of those, the ones who have paid for a visit: the referral is earned. */
  earned: number;
  /** Earned, and the shop has not handed anything over yet. */
  waiting: number;
  rewarded: number;
}

/**
 * Where a customer stands.
 *
 * `paidVisits` is how many visits each referred person has paid for — one is
 * enough. A friend who signed up and never came in earns nobody anything,
 * which is the whole point of counting it this way.
 */
export function referralStanding(referrals: ReferralRow[], paidVisits: Record<string, number>): ReferralStanding {
  let earned = 0;
  let rewarded = 0;

  for (const referral of referrals) {
    const qualified = (paidVisits[referral.referredId] ?? 0) > 0;
    if (qualified) earned += 1;
    if (referral.rewardGivenAt) rewarded += 1;
  }

  return {
    invited: referrals.length,
    earned,
    // A reward already given for somebody who has not been in yet (the shop was
    // generous, or the visit was later removed) is not a debt owed back.
    waiting: Math.max(0, earned - rewarded),
    rewarded,
  };
}

/** May this referral be rewarded right now? */
export function canReward(referral: ReferralRow, paidVisits: number): boolean {
  if (referral.rewardGivenAt) return false;
  return paidVisits > 0;
}

/** The line the till shows about referrals, or nothing at all. */
export function referralText(standing: ReferralStanding, rewardText: string, lang: "en" | "ar" = "en"): string | null {
  if (standing.waiting < 1) return null;
  return lang === "ar"
    ? `مكافأة دعوة جاهزة (${standing.waiting}): ${rewardText}`
    : `Referral reward ready (${standing.waiting}): ${rewardText}`;
}
