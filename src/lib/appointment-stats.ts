/**
 * The day's diary in numbers: how many are coming, how many came, how many did
 * not, and what it all adds up to. Pure, so the owner's screen and the day
 * journal can both use it and agree.
 */

export interface CountedAppointment {
  status: string;
  source: string;
  totalPrice: number;
  /** Set once the appointment has been rung up. */
  visitId?: string | null;
}

export interface DiarySummary {
  /** Everything on the day except the ones called off. */
  total: number;
  booked: number;
  walkIns: number;
  online: number;
  /** Still to come: expected, waiting, or in a chair. */
  open: number;
  inChair: number;
  waiting: number;
  completed: number;
  unpaid: number;
  noShows: number;
  cancelled: number;
  /** Quoted for the appointments still open — what the day should still bring in. */
  expectedTakings: number;
  /** Quoted for what has been served and paid. The till holds the real figure. */
  servedTakings: number;
  /** Served but never paid for. Worth seeing on its own. */
  unpaidTakings: number;
  /** Quoted for the people who did not turn up. */
  missedTakings: number;
}

const EMPTY: DiarySummary = {
  total: 0,
  booked: 0,
  walkIns: 0,
  online: 0,
  open: 0,
  inChair: 0,
  waiting: 0,
  completed: 0,
  unpaid: 0,
  noShows: 0,
  cancelled: 0,
  expectedTakings: 0,
  servedTakings: 0,
  unpaidTakings: 0,
  missedTakings: 0,
};

const OPEN_STATUSES = ["PENDING", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS"];

export function summariseDiary(appointments: CountedAppointment[]): DiarySummary {
  const out = { ...EMPTY };

  for (const a of appointments) {
    if (a.status === "CANCELLED") {
      out.cancelled += 1;
      continue; // a called-off appointment is not part of the day's work
    }

    out.total += 1;
    if (a.source === "WALK_IN") out.walkIns += 1;
    else out.booked += 1;
    if (a.source === "ONLINE") out.online += 1;

    if (OPEN_STATUSES.includes(a.status)) {
      out.open += 1;
      out.expectedTakings += a.totalPrice;
      if (a.status === "IN_PROGRESS") out.inChair += 1;
      if (a.status === "CHECKED_IN") out.waiting += 1;
    } else if (a.status === "COMPLETED") {
      out.completed += 1;
      out.servedTakings += a.totalPrice;
    } else if (a.status === "COMPLETED_UNPAID") {
      out.unpaid += 1;
      out.unpaidTakings += a.totalPrice;
    } else if (a.status === "NO_SHOW") {
      out.noShows += 1;
      out.missedTakings += a.totalPrice;
    }
  }

  return out;
}

/** How often people fail to turn up, as a percentage of the day's bookings. */
export function noShowRate(summary: DiarySummary): number {
  const judged = summary.completed + summary.unpaid + summary.noShows;
  return judged === 0 ? 0 : Math.round((summary.noShows / judged) * 100);
}
