import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBarber } from "@/lib/auth";
import { getBookingSettings } from "@/lib/booking-server";
import { shopDateISO, shopTime } from "@/lib/booking";
import { summariseDiary } from "@/lib/appointment-stats";
import { earningsFor, tipsFor } from "@/lib/payroll";

/**
 * A barber's day: who is coming, who has been, and what it has earned them so
 * far. Their own work only — a barber never sees the shop's takings, another
 * barber's column, or anybody's commission but their own.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireBarber();
    const barberId = session.user.barberId;
    const settings = await getBookingSettings();
    const date = req.nextUrl.searchParams.get("date") || shopDateISO(Date.now(), settings.timezone);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const from = new Date(shopTime(date, 0, settings.timezone));
    const to = new Date(shopTime(date, 24 * 60, settings.timezone));

    const [appointments, visits, salary] = await Promise.all([
      prisma.appointment.findMany({
        where: { barberId, startAt: { gte: from, lt: to } },
        orderBy: { startAt: "asc" },
        select: {
          id: true,
          startAt: true,
          endAt: true,
          status: true,
          source: true,
          notes: true,
          durationMinutes: true,
          totalPrice: true,
          visitId: true,
          customer: { select: { id: true, name: true, phone: true } },
          services: { select: { id: true, serviceName: true } },
        },
      }),
      prisma.visit.findMany({
        where: { barberId, visitAt: { gte: from, lt: to } },
        select: {
          total: true,
          tip: true,
          items: { select: { priceAtTime: true, quantity: true, service: { select: { excludeFromCommission: true } } } },
        },
      }),
      prisma.barberSalarySettings.findUnique({ where: { barberId } }),
    ]);

    const earnings = earningsFor(visits, salary);

    return NextResponse.json({
      date,
      appointments,
      summary: summariseDiary(appointments),
      earned: {
        visitCount: earnings.visitCount,
        takings: earnings.visitTotal,
        commission: earnings.commission,
        tips: tipsFor(visits),
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
