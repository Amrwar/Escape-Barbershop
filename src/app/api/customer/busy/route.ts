import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBookingSettings } from "@/lib/booking-server";
import { shopDateISO, shopTime } from "@/lib/booking";
import { estimateWaits } from "@/lib/queue";
import { quieterSoon, typicalBusyness } from "@/lib/busyness";

/**
 * "Is it worth walking down now?"
 *
 * Two answers, and which one the customer gets depends on how the shop is
 * working today.
 *
 * If people are checked in and in chairs, the live queue is the better answer
 * and it is given. If the shop is ringing walk-ins straight through the till —
 * which is how this shop actually runs — the queue is empty all day, and a live
 * "no wait" read off that would be a lie told confidently. So the fallback is
 * what actually happened at this hour on this weekday, labelled as the forecast
 * it is.
 *
 * Open to anyone: it is the same thing the screen on the wall says to the room.
 */
export const dynamic = "force-dynamic";

/** How far back to read the shop's own rhythm. Long enough to be a pattern. */
const HISTORY_DAYS = 120;

/** Longer than the longest service, so a cut that started before midnight is still live after it. */
const LIVE_LOOKBACK_MS = 4 * 60 * 60 * 1000;

export async function GET() {
  try {
    const settings = await getBookingSettings();
    const now = Date.now();
    const today = shopDateISO(now, settings.timezone);
    const dayStart = new Date(shopTime(today, 0, settings.timezone));
    // The shop is open until midnight, so somebody still in the chair at five
    // past is still in the chair. The earlier of the day's start and a few hours
    // ago keeps them, while a cut nobody closed yesterday still does not count.
    const liveSince = new Date(Math.min(dayStart.getTime(), now - LIVE_LOOKBACK_MS));

    const [live, history] = await Promise.all([
      prisma.appointment.findMany({
        where: {
          startAt: { gte: liveSince },
          status: { in: ["CHECKED_IN", "IN_PROGRESS"] },
        },
        orderBy: { startAt: "asc" },
        select: { id: true, durationMinutes: true, barberId: true, endAt: true, status: true },
      }),
      prisma.visit.findMany({
        where: { visitAt: { gte: new Date(now - HISTORY_DAYS * 86_400_000) } },
        select: { visitAt: true },
      }),
    ]);

    const inChair = live.filter((a) => a.status === "IN_PROGRESS");
    const waiting = live.filter((a) => a.status === "CHECKED_IN");

    // The queue is only an answer if the shop is using it. No chairs and nobody
    // waiting means "not in use" far more often than it means "empty".
    const queueInUse = live.length > 0;
    const waits = queueInUse ? estimateWaits(waiting, inChair, now) : [];

    return NextResponse.json({
      live: queueInUse
        ? {
            inChair: inChair.length,
            waiting: waiting.length,
            // The longest anybody is likely to wait, which is what a person
            // arriving now would join the back of.
            waitMinutes: waits.length ? Math.max(...waits.map((w) => w.waitMinutes)) : 0,
          }
        : null,
      typical: typicalBusyness(history, now, settings.timezone),
      quieterAt: quieterSoon(history, now, settings.timezone),
    });
  } catch (err) {
    console.error("[customer/busy]", err);
    // A card that cannot say anything simply does not appear.
    return NextResponse.json({ live: null, typical: null, quieterAt: [] });
  }
}
