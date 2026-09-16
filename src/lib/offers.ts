/**
 * Offers the shop is running. Pure, so the customer app and the shop's own
 * screen agree on what "running" means.
 *
 * An offer is a notice, not a rule: nothing here touches a price. The shop
 * still decides at the till what to charge, which is what keeps the takings a
 * record of what happened rather than what was advertised.
 */

export interface OfferLike {
  isActive: boolean;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
}

const time = (value: Date | string | null | undefined) => (value ? new Date(value).getTime() : null);

/** Whether an offer should be shown to customers right now. */
export function isRunning(offer: OfferLike, now = Date.now()): boolean {
  if (!offer.isActive) return false;
  const from = time(offer.startsAt);
  const to = time(offer.endsAt);
  if (from !== null && now < from) return false;
  if (to !== null && now > to) return false;
  return true;
}

/** Not started yet, running, or finished — for the shop's own list. */
export function offerState(offer: OfferLike, now = Date.now()): "scheduled" | "running" | "finished" | "off" {
  if (!offer.isActive) return "off";
  const from = time(offer.startsAt);
  const to = time(offer.endsAt);
  if (from !== null && now < from) return "scheduled";
  if (to !== null && now > to) return "finished";
  return "running";
}

/** How much is saved, when the shop has put both prices on the offer. */
export function savingOf(offer: { price?: number | null; wasPrice?: number | null }): number | null {
  if (offer.price == null || offer.wasPrice == null) return null;
  const saving = offer.wasPrice - offer.price;
  return saving > 0 ? saving : null;
}
