/**
 * What happens after somebody does not turn up.
 *
 * A no-show costs the shop a chair it could have sold, and the customer nothing
 * at all. The answer here is deliberately mild: nobody is ever barred from
 * booking. Somebody who has missed twice is simply asked for a deposit first,
 * whatever they are booking — the same deposit the expensive work already asks
 * for, so there is no second mechanism and no second thing to explain.
 *
 * Two shapes of forgiveness are built in, because a policy with no way back is
 * a policy that eventually loses a good customer over a bad week:
 *
 *  - misses stop counting after a while, on their own;
 *  - and the shop can wipe the slate at any time, from the customer's page.
 */

export interface NoShowPolicy {
  enabled: boolean;
  /** Misses before a deposit is asked for. */
  allowed: number;
  /** How far back to look. A miss older than this is forgotten. */
  windowDays: number;
}

export const DEFAULT_NO_SHOW_POLICY: NoShowPolicy = {
  enabled: false,
  allowed: 2,
  windowDays: 90,
};

export interface MissedAppointment {
  startAt: Date | string;
}

const DAY = 86_400_000;
const time = (value: Date | string) => new Date(value).getTime();

/**
 * Misses that still count: recent enough, and since the shop last forgave them.
 */
export function countingMisses(
  missed: MissedAppointment[],
  forgivenAt: Date | string | null | undefined,
  now: number = Date.now(),
  policy: NoShowPolicy = DEFAULT_NO_SHOW_POLICY
): number {
  const cutoff = now - policy.windowDays * DAY;
  const forgiven = forgivenAt ? time(forgivenAt) : 0;

  return missed.filter((miss) => {
    const when = time(miss.startAt);
    return when >= cutoff && when > forgiven;
  }).length;
}

/**
 * Must this customer pay something up front, whatever they are booking?
 *
 * Note what this does not do: it never refuses the booking. Somebody who has
 * missed twice is a customer the shop would still like to see.
 */
export function mustPayUpFront(
  missed: MissedAppointment[],
  forgivenAt: Date | string | null | undefined,
  now: number = Date.now(),
  policy: NoShowPolicy = DEFAULT_NO_SHOW_POLICY
): boolean {
  if (!policy.enabled) return false;
  return countingMisses(missed, forgivenAt, now, policy) >= policy.allowed;
}

/** How the shop's own screens describe where somebody stands. */
export function standing(
  missed: MissedAppointment[],
  forgivenAt: Date | string | null | undefined,
  now: number = Date.now(),
  policy: NoShowPolicy = DEFAULT_NO_SHOW_POLICY
): { misses: number; askForDeposit: boolean; allowed: number } {
  const misses = countingMisses(missed, forgivenAt, now, policy);
  return { misses, askForDeposit: policy.enabled && misses >= policy.allowed, allowed: policy.allowed };
}
