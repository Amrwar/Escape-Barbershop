/**
 * How long the people waiting are likely to wait. Pure, so it can be tested and
 * reused by the queue screen and (later) a "your barber is ready" message.
 *
 * The estimate is deliberately simple and slightly pessimistic: a waiting
 * customer goes to whichever chair frees up first, and each chair frees when the
 * person in it finishes. A shop can read that at a glance and trust it; anything
 * cleverer would be a guess dressed up as a promise.
 */

export interface QueuedAppointment {
  id: string;
  durationMinutes: number;
  barberId: string | null;
  endAt: Date | string;
}

export interface WaitEstimate<T> {
  appointment: T;
  /** Minutes from now until this customer is likely to sit down. */
  waitMinutes: number;
  position: number;
}

const MINUTE = 60_000;

export function estimateWaits<T extends QueuedAppointment>(
  waiting: T[],
  inChair: T[],
  now = Date.now()
): WaitEstimate<T>[] {
  // When each chair is next free. A chair already running frees at its end time;
  // anything already overdue counts as free now.
  const chairsFreeAt = inChair.map((a) => Math.max(now, new Date(a.endAt).getTime()));

  return waiting.map((appointment, index) => {
    // A customer who asked for a particular barber waits for that barber.
    const ownChair = appointment.barberId
      ? inChair.find((c) => c.barberId === appointment.barberId)
      : undefined;

    let freeAt: number;
    if (ownChair) {
      freeAt = Math.max(now, new Date(ownChair.endAt).getTime());
      // Their barber then works through this booking before the next one.
      const chairIndex = chairsFreeAt.indexOf(freeAt);
      if (chairIndex >= 0) chairsFreeAt[chairIndex] = freeAt + appointment.durationMinutes * MINUTE;
    } else if (chairsFreeAt.length === 0) {
      freeAt = now; // nobody is in a chair: they go straight in
    } else {
      // Whichever chair frees first, which then fills for this service.
      const soonest = Math.min(...chairsFreeAt);
      freeAt = soonest;
      chairsFreeAt[chairsFreeAt.indexOf(soonest)] = soonest + appointment.durationMinutes * MINUTE;
    }

    return {
      appointment,
      waitMinutes: Math.max(0, Math.round((freeAt - now) / MINUTE)),
      position: index + 1,
    };
  });
}
