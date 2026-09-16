import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBarber } from "@/lib/auth";
import { getBookingSettings } from "@/lib/booking-server";
import { shopDateISO, shopTime } from "@/lib/booking";
import { earningsFor, tipsFor } from "@/lib/payroll";

/**
 * What a barber has earned this week and this month: their commission on the
 * work they did, and their tips, counted the same way the payroll sheet counts
 * them at the end of the month.
 *
 * Advances and penalties are deliberately not here. They belong to the payroll
 * conversation with the owner, not to a running total on a phone.
 */
export async function GET() {
  try {
    const session = await requireBarber();
    const barberId = session.user.barberId;
    const settings = await getBookingSettings();

    const today = shopDateISO(Date.now(), settings.timezone);
    const [y, m, d] = today.split("-").map(Number);
    const weekday = new Date(shopTime(today, 12 * 60, settings.timezone)).getDay();

    // The shop's week starts on Saturday, as Egypt's does.
    const daysSinceSaturday = (weekday + 1) % 7;
    const weekStartDate = new Date(Date.UTC(y, m - 1, d - daysSinceSaturday));
    const weekStartISO = weekStartDate.toISOString().slice(0, 10);

    const weekStart = new Date(shopTime(weekStartISO, 0, settings.timezone));
    const monthStart = new Date(shopTime(`${today.slice(0, 7)}-01`, 0, settings.timezone));
    const now = new Date();

    const select = {
      visitAt: true,
      total: true,
      tip: true,
      items: { select: { priceAtTime: true, quantity: true, service: { select: { excludeFromCommission: true } } } },
    };

    const [weekVisits, monthVisits, salary, missed] = await Promise.all([
      prisma.visit.findMany({ where: { barberId, visitAt: { gte: weekStart, lte: now } }, select }),
      prisma.visit.findMany({ where: { barberId, visitAt: { gte: monthStart, lte: now } }, select }),
      prisma.barberSalarySettings.findUnique({ where: { barberId } }),
      prisma.appointment.count({ where: { barberId, status: "NO_SHOW", startAt: { gte: monthStart, lte: now } } }),
    ]);

    const week = earningsFor(weekVisits, salary);
    const month = earningsFor(monthVisits, salary);

    // Day by day through the week, so they can see where it came from.
    const byDay = new Map<string, { takings: number; visits: number }>();
    for (const v of weekVisits) {
      const day = shopDateISO(v.visitAt.getTime(), settings.timezone);
      const row = byDay.get(day) ?? { takings: 0, visits: 0 };
      row.takings += v.total;
      row.visits += 1;
      byDay.set(day, row);
    }

    return NextResponse.json({
      week: { ...week, tips: tipsFor(weekVisits), from: weekStartISO },
      month: { ...month, tips: tipsFor(monthVisits), noShows: missed },
      commissionRule: salary
        ? { type: salary.commissionType, value: salary.commissionValue }
        : null,
      days: Array.from(byDay.entries())
        .map(([date, row]) => ({ date, ...row }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
