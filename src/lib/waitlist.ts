/**
 * The waiting list.
 *
 * A cancellation is the most wasteful thing that happens in a barbershop: a
 * chair that was spoken for goes empty, and the person who wanted that day
 * never hears about it. This turns one into the other.
 *
 * The rules are about fairness and about not wasting anybody's time:
 *
 *  - the longest-waiting customer the slot actually suits is offered it first;
 *  - the offer is theirs alone for twenty minutes, because two people racing
 *    for one chair is worse than waiting;
 *  - an offer that lapses passes to the next in line, not back into the void;
 *  - nobody is offered a slot that cannot hold what they asked for, and nobody
 *    who asked for a particular barber is offered somebody else's chair.
 */

export const OFFER_MINUTES = 20;

export interface WaitingCustomer {
  id: string;
  customerId: string;
  dateISO: string;
  /** Null when any barber will do. */
  barberId: string | null;
  status: string;
  /** Minutes the services they asked for will take, all told. */
  durationMinutes: number;
  createdAt: Date | string;
  offerExpiresAt?: Date | string | null;
}

export interface FreedSlot {
  dateISO: string;
  startAt: Date | string;
  /** How long the chair is free for, from that moment. */
  minutes: number;
  /** Whose chair it was. */
  barberId: string | null;
}

const time = (value: Date | string) => new Date(value).getTime();

/** Has an offer run out of time? */
export function offerLapsed(entry: WaitingCustomer, now: number = Date.now()): boolean {
  if (entry.status !== "OFFERED" || !entry.offerExpiresAt) return false;
  return time(entry.offerExpiresAt) <= now;
}

/**
 * Would this freed chair suit them?
 *
 * A customer who asked for Abdullah is not offered Khaled's chair — they asked
 * for a person, not a time. A customer who asked for anybody takes whatever
 * frees up.
 */
export function suits(entry: WaitingCustomer, slot: FreedSlot): boolean {
  if (entry.dateISO !== slot.dateISO) return false;
  if (entry.durationMinutes > slot.minutes) return false;
  if (entry.barberId && slot.barberId && entry.barberId !== slot.barberId) return false;
  if (entry.barberId && !slot.barberId) return false;
  return true;
}

/**
 * Who to offer a freed chair to: the longest-waiting person it suits, counting
 * only those still waiting and those whose offer has lapsed.
 */
export function nextInLine(
  entries: WaitingCustomer[],
  slot: FreedSlot,
  now: number = Date.now()
): WaitingCustomer | null {
  const available = entries.filter(
    (entry) => entry.status === "WAITING" || offerLapsed(entry, now)
  );

  const fits = available.filter((entry) => suits(entry, slot));
  if (fits.length === 0) return null;

  return fits.sort((a, b) => time(a.createdAt) - time(b.createdAt))[0];
}

/** When an offer made now would run out. */
export function offerExpiry(now: number = Date.now(), minutes = OFFER_MINUTES): Date {
  return new Date(now + minutes * 60_000);
}

/**
 * Is this offer still good enough to book against?
 *
 * Checked when they tap, not only when it was sent: a slot in the past is no
 * use to anybody, and an expired offer belongs to whoever is next.
 */
export function claimable(
  entry: WaitingCustomer & { offeredStartAt?: Date | string | null },
  now: number = Date.now()
): boolean {
  if (entry.status !== "OFFERED") return false;
  if (!entry.offeredStartAt) return false;
  if (offerLapsed(entry, now)) return false;
  return time(entry.offeredStartAt) > now;
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/** The message itself: the time, whose chair, and how long they have. */
export function offerMessage(
  slot: FreedSlot,
  barberName: string | null,
  lang: "en" | "ar" = "en",
  timeZone = "Africa/Cairo"
): PushMessage {
  const when = new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-GB", {
    timeZone,
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: lang !== "ar",
  }).format(new Date(slot.startAt));

  return lang === "ar"
    ? {
        title: "مكان فاضي!",
        body: barberName
          ? `${when} مع ${barberName} — احجزه خلال ${OFFER_MINUTES} دقيقة`
          : `${when} — احجزه خلال ${OFFER_MINUTES} دقيقة`,
        url: "/app",
        tag: `waitlist-${slot.dateISO}`,
      }
    : {
        title: "A time has opened",
        body: barberName
          ? `${when} with ${barberName} — yours for the next ${OFFER_MINUTES} minutes`
          : `${when} — yours for the next ${OFFER_MINUTES} minutes`,
        url: "/app",
        tag: `waitlist-${slot.dateISO}`,
      };
}
