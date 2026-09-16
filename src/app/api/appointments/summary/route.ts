import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { getBookingSettings } from "@/lib/booking-server";
import { shopDateISO, shopTime } from "@/lib/booking";
import { noShowRate, summariseDiary } from "@/lib/appointment-stats";

/**
 * The day's diary in numbers. The shop day runs by the shop's own clock, so
 * this is the same day the queue and the diary screens show.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const settings = await getBookingSettings();
    const date = req.nextUrl.searchParams.get("date") || shopDateISO(Date.now(), settings.timezone);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const from = new Date(shopTime(date, 0, settings.timezone));
    const to = new Date(shopTime(date, 24 * 60, settings.timezone));

    const appointments = await prisma.appointment.findMany({
      where: { startAt: { gte: from, lt: to } },
      select: { status: true, source: true, totalPrice: true, visitId: true },
    });

    const summary = summariseDiary(appointments);
    return NextResponse.json({ date, summary, noShowRate: noShowRate(summary) });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
