import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBookingSettings } from "@/lib/booking-server";
import { shopDateISO, shopTime } from "@/lib/booking";
import { paymentSplit } from "@/lib/payments";
import { digestMessage, worthSending, type DayNumbers } from "@/lib/digest";
import { sendPush } from "@/lib/push";

/**
 * The owner's line at closing time.
 *
 * Counted from the same rows as the day journal — paid visits for the shop's own
 * day — so it can never tell a different story from the reports. It goes only to
 * owners who have turned notifications on, on whatever device they turned them
 * on; subscribing is the opt-in, so there is no setting to forget.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const settings = await getBookingSettings();
    const today = shopDateISO(Date.now(), settings.timezone);

    // The shop's own day: its midnight, through to 3am the next morning, which
    // is the same window the day report uses.
    const from = new Date(shopTime(today, 0, settings.timezone));
    const to = new Date(shopTime(today, 27 * 60, settings.timezone));
    const tomorrowStart = new Date(shopTime(today, 24 * 60, settings.timezone));
    const tomorrowEnd = new Date(shopTime(today, 48 * 60, settings.timezone));

    const [visits, noShows, tomorrow] = await Promise.all([
      prisma.visit.findMany({
        where: { visitAt: { gte: from, lte: to } },
        select: { total: true, paymentMethod: true, cashAmount: true, cardAmount: true, instapayAmount: true },
      }),
      prisma.appointment.findMany({
        where: { status: "NO_SHOW", startAt: { gte: from, lte: to } },
        select: { totalPrice: true },
      }),
      prisma.appointment.count({
        where: {
          startAt: { gte: tomorrowStart, lt: tomorrowEnd },
          status: { in: ["PENDING", "CONFIRMED"] },
        },
      }),
    ]);

    const day: DayNumbers = {
      visits: visits.length,
      takings: Math.round(visits.reduce((sum, v) => sum + v.total, 0) * 100) / 100,
      cash: 0,
      card: 0,
      instapay: 0,
      noShows: noShows.length,
      noShowValue: Math.round(noShows.reduce((sum, a) => sum + a.totalPrice, 0) * 100) / 100,
      tomorrow,
    };

    for (const visit of visits) {
      const split = paymentSplit(visit);
      day.cash += split.cash;
      day.card += split.card;
      day.instapay += split.instapay;
    }

    if (!worthSending(day)) {
      return NextResponse.json({ sent: 0, reason: "nothing happened today", day });
    }

    const owners = await prisma.user.findMany({
      where: { role: "OWNER", pushDevices: { some: {} } },
      select: { id: true },
    });

    let sent = 0;
    for (const owner of owners) {
      sent += await sendPush({ userId: owner.id }, digestMessage(day, today));
    }

    return NextResponse.json({ owners: owners.length, notificationsSent: sent, day });
  } catch (err) {
    console.error("[cron/digest]", err);
    return NextResponse.json({ error: "Digest run failed" }, { status: 500 });
  }
}
