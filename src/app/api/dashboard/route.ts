import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { getJournalOutflows, getVisaCommissionPercent, visaCommissionOn, round2 } from "@/lib/finance";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    // tz = client's offset in minutes east of UTC (e.g. 120 for UTC+2)
    const tz = parseInt(req.nextUrl.searchParams.get("tz") ?? "0", 10) || 0;
    const offsetMs = tz * 60 * 1000;
    const now = new Date();
    // Shift "now" by the client offset to compute local date components
    const local = new Date(now.getTime() + offsetMs);
    // Business day boundary: 3AM. If local time is before 3AM, "today" started at 3AM yesterday.
    const BOUNDARY_HOUR = 3;
    const effectiveLocal = local.getUTCHours() < BOUNDARY_HOUR
      ? new Date(local.getTime() - 24 * 60 * 60 * 1000)
      : local;
    const todayStart = new Date(Date.UTC(effectiveLocal.getUTCFullYear(), effectiveLocal.getUTCMonth(), effectiveLocal.getUTCDate(), BOUNDARY_HOUR) - offsetMs);
    const monthStart = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - offsetMs);
    const monthEnd = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0, 23, 59, 59) - offsetMs);

    const barberFilter = {};

    const isOwner = session.user.role === "OWNER";

    // Discounts need the line prices to value them, so they are fetched
    // separately and only for the visits that actually carry one.
    const discountValue = (
      rows: { total: number; items: { priceAtTime: number; quantity: number }[] }[]
    ) =>
      round2(
        rows.reduce((s, v) => {
          const subtotal = v.items.reduce((a, i) => a + i.priceAtTime * i.quantity, 0);
          return s + (subtotal - v.total);
        }, 0)
      );

    const [
      todayVisits,
      monthVisits,
      topServices,
      revenuePerBarber,
      todayOutflows,
      monthOutflows,
      visaPercent,
      todayDiscounted,
      monthDiscounted,
    ] = await Promise.all([
        prisma.visit.findMany({
          where: { visitAt: { gte: todayStart }, ...barberFilter },
          select: { total: true, cashAmount: true, cardAmount: true, paymentMethod: true, tip: true },
        }),
        prisma.visit.findMany({
          where: {
            visitAt: { gte: monthStart, lte: monthEnd },
            ...barberFilter,
          },
          select: { total: true, cashAmount: true, cardAmount: true, paymentMethod: true, tip: true },
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
        // Expenses and advances, split by how they were paid
        // Open-ended on purpose: today has no upper bound yet.
        getJournalOutflows(todayStart),
        getJournalOutflows(monthStart, monthEnd),
        getVisaCommissionPercent(),
        prisma.visit.findMany({
          where: { visitAt: { gte: todayStart }, discount: { gt: 0 } },
          select: { total: true, items: { select: { priceAtTime: true, quantity: true } } },
        }),
        prisma.visit.findMany({
          where: { visitAt: { gte: monthStart, lte: monthEnd }, discount: { gt: 0 } },
          select: { total: true, items: { select: { priceAtTime: true, quantity: true } } },
        }),
      ]);

    // Enrich top services with names
    const serviceIds = topServices.map((s) => s.serviceId);
    const services = await prisma.service.findMany({
      where: { id: { in: serviceIds } },
      select: { id: true, name: true, arabicName: true },
    });
    const serviceMap = Object.fromEntries(services.map((s) => [s.id, { name: s.name, arabicName: s.arabicName }]));

    // Enrich revenue per barber with names (filter out null barberId from visits with deleted barbers)
    const barberIds = (revenuePerBarber as Array<{ barberId: string | null }>)
      .map((b) => b.barberId)
      .filter((id): id is string => id !== null);
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
        const drawerOutflows = await getJournalOutflows(openSession.openedAt, new Date());
        const expectedCash = round2(
          openSession.openingCash +
            cashSales +
            cashIn -
            cashOut -
            drawerOutflows.cashExpenses -
            drawerOutflows.cashAdvances
        );
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
          const expectedCash = round2(lastClosed.openingCash + cashSales + cashIn - cashOut);
          drawerStatus = { isOpen: false, lastDifference: round2(lastClosed.closingCashCounted - expectedCash) };
        }
      }
    } catch {
      // Cash drawer tables not available yet — return default closed status
    }

    const todayExpensesTotal = todayOutflows.expensesTotal;
    const monthExpensesTotal = monthOutflows.expensesTotal;

    // Compute cash/card breakdown
    const computeBreakdown = (visits: { total: number; cashAmount: number | null; cardAmount: number | null; paymentMethod: string; tip: number }[]) => {
      let cash = 0, card = 0, tips = 0;
      for (const v of visits) {
        if (v.paymentMethod === "CASH") cash += v.total;
        else if (v.paymentMethod === "CARD") card += v.total;
        else if (v.paymentMethod === "MIXED") { cash += v.cashAmount ?? 0; card += v.cardAmount ?? 0; }
        tips += v.tip ?? 0;
      }
      return { cash: cash - tips, card, tips };
    };
    const { cash: todayCash, card: todayCard, tips: todayTips } = computeBreakdown(todayVisits);
    const { cash: monthCash, card: monthCard, tips: monthTips } = computeBreakdown(monthVisits);

    // The card machine takes its cut off the card sales, so it comes out of the
    // day's revenue exactly like an expense does.
    const todayVisaCommission = visaCommissionOn(todayCard, visaPercent);
    const monthVisaCommission = visaCommissionOn(monthCard, visaPercent);

    return NextResponse.json({
      todayRevenue: round2(
        todayVisits.reduce((s, v) => s + v.total, 0) - todayExpensesTotal - todayVisaCommission
      ),
      monthRevenue: round2(
        monthVisits.reduce((s, v) => s + v.total, 0) - monthExpensesTotal - monthVisaCommission
      ),
      todayCash,
      todayCard,
      todayTips,
      todayExpenses: todayExpensesTotal,
      todayCashExpenses: todayOutflows.cashExpenses,
      todayCardExpenses: todayOutflows.cardExpenses,
      todayAdvances: todayOutflows.advancesTotal,
      todayVisaCommission,
      todayCardNet: round2(todayCard - todayVisaCommission - todayOutflows.cardExpenses),
      monthCash,
      monthCard,
      monthTips,
      monthExpenses: monthExpensesTotal,
      monthAdvances: monthOutflows.advancesTotal,
      todayDiscounts: discountValue(todayDiscounted),
      todayDiscountedVisits: todayDiscounted.length,
      monthDiscounts: discountValue(monthDiscounted),
      monthDiscountedVisits: monthDiscounted.length,
      monthVisaCommission,
      visaPercent,
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
          barberId: string | null;
          _sum: { total: number | null };
          _count: { id: number };
        }>
      )
        .filter((b) => b.barberId !== null)
        .map((b) => ({
          barberId: b.barberId!,
          name: barberMap[b.barberId!] ?? "Unknown",
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
