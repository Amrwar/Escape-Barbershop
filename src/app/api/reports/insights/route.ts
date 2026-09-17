import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { getBookingSettings } from "@/lib/booking-server";
import { barberShares, byDay, byHour, byWeekday, newVersusReturning, retention } from "@/lib/insights";

/**
 * The shop read from its own takings: who came, when they came, who served
 * them, and whether they came back.
 *
 * The owner's screen. A cashier sees the day, not the pattern of the year —
 * and retention in particular is a question about the whole history, so the
 * window only ever narrows the "when" half of the answer.
 */
export async function GET(req: NextRequest) {
  try {
    await requireOwner();
    const settings = await getBookingSettings();

    const fromParam = req.nextUrl.searchParams.get("from");
    const toParam = req.nextUrl.searchParams.get("to");
    const to = toParam ? new Date(toParam) : new Date();
    const from = fromParam ? new Date(fromParam) : new Date(to.getTime() - 90 * 86_400_000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return NextResponse.json({ error: "Those dates do not make sense" }, { status: 400 });
    }

    const [windowVisits, everyVisit, barbers] = await Promise.all([
      prisma.visit.findMany({
        where: { visitAt: { gte: from, lte: to } },
        select: { customerId: true, barberId: true, visitAt: true, total: true },
        orderBy: { visitAt: "asc" },
      }),
      // Lifetimes, for the two questions a window cannot answer: who is new, and
      // who comes back.
      prisma.visit.findMany({ select: { customerId: true, visitAt: true }, orderBy: { visitAt: "asc" } }),
      prisma.barber.findMany({ select: { id: true, name: true } }),
    ]);

    const firstVisitAt: Record<string, Date> = {};
    const history: Record<string, Date[]> = {};
    for (const visit of everyVisit) {
      firstVisitAt[visit.customerId] ??= visit.visitAt;
      (history[visit.customerId] ??= []).push(visit.visitAt);
    }

    const names = new Map(barbers.map((b) => [b.id, b.name]));
    const standing = retention(history);
    const slipping = await prisma.customer.findMany({
      where: { id: { in: standing.slipping.slice(0, 200) } },
      select: { id: true, name: true, phone: true },
      take: 50,
    });

    return NextResponse.json({
      from,
      to,
      visits: windowVisits.length,
      takings: Math.round(windowVisits.reduce((sum, v) => sum + v.total, 0) * 100) / 100,
      newVersusReturning: newVersusReturning(windowVisits, firstVisitAt),
      weekdays: byWeekday(windowVisits, settings.timezone),
      hours: byHour(windowVisits, settings.timezone),
      days: byDay(windowVisits, settings.timezone),
      barbers: barberShares(windowVisits).map((share) => ({ ...share, name: names.get(share.barberId) ?? "—" })),
      retention: {
        customers: standing.customers,
        repeatCustomers: standing.repeatCustomers,
        repeatPercent: standing.repeatPercent,
        medianGapDays: standing.medianGapDays,
        slippingCount: standing.slipping.length,
        slipping,
      },
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[reports/insights]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
