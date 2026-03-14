import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    // tz = client's offset in minutes east of UTC (e.g. 120 for UTC+2)
    const tz = parseInt(req.nextUrl.searchParams.get("tz") ?? "0", 10) || 0;
    const offsetMs = tz * 60 * 1000;
    const now = new Date();
    // Shift "now" by the client offset to compute local date components
    const local = new Date(now.getTime() + offsetMs);
    // Business day starts at 3AM: if current local time is before 3AM, we're still in the previous calendar day's business period
    const localHour = local.getUTCHours();
    const businessDayOffset = localHour < 3 ? -1 : 0;
    const todayStart = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + businessDayOffset, 3, 0, 0) - offsetMs);
    const monthStart = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - offsetMs);
    const monthEnd = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0, 23, 59, 59) - offsetMs);

    const barberFilter = {};

    const isOwner = session.user.role === "OWNER" || session.user.role === "CASHIER";

    const [todayVisits, monthVisits, topServices, revenuePerBarber, todayExpenses, monthExpenses] =
      await Promise.all([
        prisma.visit.findMany({
          where: { visitAt: { gte: todayStart }, ...barberFilter },
          select: { total: true, cashAmount: true, cardAmount: true, paymentMethod: true },
        }),
        prisma.visit.findMany({
          where: {
            visitAt: { gte: monthStart, lte: monthEnd },
            ...barberFilter,
          },
          select: { total: true, cashAmount: true, cardAmount: true, paymentMethod: true },
        }),
        prisma.visitItem.groupBy({
          by: ["serviceId"],
          where: {
            visit: {
              visitAt: { gte: monthStart, lte: monthEnd },
              ...barberFilter,
            },
          },
          _sum: { quantity: true },
          _count: { id: true },
          orderBy: { _sum: { quantity: "desc" } },
          take: 5,
        }),
        isOwner
          ? prisma.visit.groupBy({
              by: ["barberId"],
              where: { visitAt: { gte: monthStart, lte: monthEnd } },
              _sum: { total: true },
              _count: { id: true },
            })
          : Promise.resolve([]),
        // Wrapped in try-catch so a missing Expense table never breaks the dashboard
        isOwner
          ? prisma.expense.findMany({ where: { date: { gte: todayStart } }, select: { amount: true } }).catch(() => [])
          : Promise.resolve([]),
        isOwner
          ? prisma.expense.findMany({ where: { date: { gte: monthStart, lte: monthEnd } }, select: { amount: true } }).catch(() => [])
          : Promise.resolve([]),
      ]);

    // Enrich top services with names
    const serviceIds = topServices.map((s) => s.serviceId);
    const services = await prisma.service.findMany({
      where: { id: { in: serviceIds } },
      select: { id: true, name: true, arabicName: true },
    });
    const serviceMap = Object.fromEntries(services.map((s) => [s.id, { name: s.name, arabicName: s.arabicName }]));

    // Enrich revenue per barber with names
    const barberIds = (revenuePerBarber as Array<{ barberId: string }>).map(
      (b) => b.barberId
    );
    const barbers = await prisma.barber.findMany({
      where: { id: { in: barberIds } },
      select: { id: true, name: true },
    });
    const barberMap = Object.fromEntries(barbers.map((b) => [b.id, b.name]));

    // Cash drawer status — wrapped separately so a failure here never breaks the main dashboard
    let drawerStatus: {
      isOpen: boolean;
      expectedCash?: number;
      openSessionId?: string;
      lastDifference?: number;
    } = { isOpen: false };

    try {
      const openSession = await prisma.cashDrawerSession.findFirst({
        where: { status: "OPEN" },
        include: {
          movements: { select: { type: true, amount: true } },
          visits: { select: { cashAmount: true, paymentMethod: true, total: true } },
        },
      });

      if (openSession) {
        const cashSales = openSession.visits
          .filter((v) => v.paymentMethod === "CASH" || v.paymentMethod === "MIXED")
          .reduce((s, v) => s + (v.cashAmount ?? (v.paymentMethod === "CASH" ? v.total : 0)), 0);
        const cashIn = openSession.movements.filter((m) => m.type === "IN").reduce((s, m) => s + m.amount, 0);
        const cashOut = openSession.movements.filter((m) => m.type === "OUT").reduce((s, m) => s + m.amount, 0);
        const expectedCash = openSession.openingCash + cashSales + cashIn - cashOut;
        drawerStatus = { isOpen: true, expectedCash, openSessionId: openSession.id };
      } else {
        const lastClosed = await prisma.cashDrawerSession.findFirst({
          where: { status: "CLOSED" },
          orderBy: { closedAt: "desc" },
          select: { closingCashCounted: true, openingCash: true, id: true, movements: { select: { type: true, amount: true } }, visits: { select: { cashAmount: true, paymentMethod: true, total: true } } },
        });
        if (lastClosed && lastClosed.closingCashCounted !== null) {
          const cashSales = lastClosed.visits
            .filter((v) => v.paymentMethod === "CASH" || v.paymentMethod === "MIXED")
            .reduce((s, v) => s + (v.cashAmount ?? (v.paymentMethod === "CASH" ? v.total : 0)), 0);
          const cashIn = lastClosed.movements.filter((m) => m.type === "IN").reduce((s, m) => s + m.amount, 0);
          const cashOut = lastClosed.movements.filter((m) => m.type === "OUT").reduce((s, m) => s + m.amount, 0);
          const expectedCash = lastClosed.openingCash + cashSales + cashIn - cashOut;
          drawerStatus = { isOpen: false, lastDifference: lastClosed.closingCashCounted - expectedCash };
        }
      }
    } catch {
      // Cash drawer tables not available yet — return default closed status
    }

    const todayExpensesTotal = (todayExpenses as { amount: number }[]).reduce((s, e) => s + e.amount, 0);
    const monthExpensesTotal = (monthExpenses as { amount: number }[]).reduce((s, e) => s + e.amount, 0);

    // Compute cash/card breakdown
    const computeBreakdown = (visits: { total: number; cashAmount: number | null; cardAmount: number | null; paymentMethod: string }[]) => {
      let cash = 0, card = 0;
      for (const v of visits) {
        if (v.paymentMethod === "CASH") cash += v.total;
        else if (v.paymentMethod === "CARD") card += v.total;
        else if (v.paymentMethod === "MIXED") { cash += v.cashAmount ?? 0; card += v.cardAmount ?? 0; }
      }
      return { cash, card };
    };
    const { cash: todayCash, card: todayCard } = computeBreakdown(todayVisits);
    const { cash: monthCash, card: monthCard } = computeBreakdown(monthVisits);

    return NextResponse.json({
      todayRevenue: todayVisits.reduce((s, v) => s + v.total, 0) - todayExpensesTotal,
      monthRevenue: monthVisits.reduce((s, v) => s + v.total, 0) - monthExpensesTotal,
      todayCash,
      todayCard,
      todayExpenses: todayExpensesTotal,
      monthCash,
      monthCard,
      monthExpenses: monthExpensesTotal,
      visitsToday: todayVisits.length,
      visitsThisMonth: monthVisits.length,
      topServices: topServices.map((s) => ({
        serviceId: s.serviceId,
        name: serviceMap[s.serviceId]?.name ?? "Unknown",
        arabicName: serviceMap[s.serviceId]?.arabicName ?? null,
        count: s._sum.quantity ?? 0,
      })),
      revenuePerBarber: (
        revenuePerBarber as Array<{
          barberId: string;
          _sum: { total: number | null };
          _count: { id: number };
        }>
      ).map((b) => ({
        barberId: b.barberId,
        name: barberMap[b.barberId] ?? "Unknown",
        revenue: b._sum.total ?? 0,
        visits: b._count.id,
      })),
      drawerStatus,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[dashboard]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
