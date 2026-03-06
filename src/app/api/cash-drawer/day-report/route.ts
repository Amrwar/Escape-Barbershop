import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();

    const dateParam = req.nextUrl.searchParams.get("date");
    const date = dateParam ? new Date(dateParam) : new Date();

    const from = new Date(date);
    from.setHours(0, 0, 0, 0);
    const to = new Date(date);
    to.setHours(23, 59, 59, 999);

    const sessions = await prisma.cashDrawerSession.findMany({
      where: { openedAt: { gte: from, lte: to } },
      orderBy: { openedAt: "asc" },
      include: {
        openedBy: { select: { name: true } },
        closedBy: { select: { name: true } },
        movements: {
          orderBy: { createdAt: "asc" },
          include: { createdBy: { select: { name: true } } },
        },
        visits: {
          include: {
            items: { include: { service: { select: { name: true } } } },
          },
        },
      },
    });

    // Aggregate across all sessions
    // Fetch expenses for the whole day
    const expenseRows = await prisma.expense.findMany({
      where: { date: { gte: from, lte: to } },
    });
    const expensesTotal = expenseRows.reduce((s, e) => s + e.amount, 0);

    let totalVisits = 0;
    let cashTotal = 0;
    let cardTotal = 0;
    let mixedCashAmount = 0;
    let discountsTotal = 0;
    let cashIn = 0;
    let cashOut = 0;
    let totalOpeningCash = 0;
    let totalCountedCash: number | null = null;
    const serviceMap = new Map<string, { name: string; count: number }>();

    for (const s of sessions) {
      totalVisits += s.visits.length;
      totalOpeningCash += s.openingCash;
      if (s.closingCashCounted !== null) {
        totalCountedCash = (totalCountedCash ?? 0) + s.closingCashCounted;
      }

      for (const v of s.visits) {
        if (v.paymentMethod === "CASH") cashTotal += v.cashAmount ?? v.total;
        else if (v.paymentMethod === "CARD") cardTotal += v.cardAmount ?? v.total;
        else if (v.paymentMethod === "MIXED") mixedCashAmount += v.cashAmount ?? 0;

        const subtotal = v.items.reduce((sum, i) => sum + i.priceAtTime * i.quantity, 0);
        discountsTotal += (subtotal * v.discount) / 100;

        for (const item of v.items) {
          const e = serviceMap.get(item.serviceId);
          if (e) e.count += item.quantity;
          else serviceMap.set(item.serviceId, { name: item.service.name, count: item.quantity });
        }
      }

      for (const m of s.movements) {
        if (m.type === "IN") cashIn += m.amount;
        else cashOut += m.amount;
      }
    }

    const cashSales = cashTotal + mixedCashAmount;
    const totalRevenue = cashTotal + cardTotal + mixedCashAmount + (sessions.flatMap(s => s.visits).filter(v => v.paymentMethod === "MIXED").reduce((sum, v) => sum + (v.cardAmount ?? 0), 0));
    const expectedCash = totalOpeningCash + cashSales + cashIn - cashOut - expensesTotal;
    const difference = totalCountedCash !== null ? totalCountedCash - expectedCash : null;

    return NextResponse.json({
      date: from.toISOString(),
      sessions: sessions.map((s) => ({
        id: s.id,
        openedAt: s.openedAt,
        closedAt: s.closedAt,
        status: s.status,
        openingCash: s.openingCash,
        closingCashCounted: s.closingCashCounted,
        openedBy: s.openedBy,
        closedBy: s.closedBy,
        visitCount: s.visits.length,
        movements: s.movements,
      })),
      summary: {
        sessionCount: sessions.length,
        totalVisits,
        cashTotal,
        cardTotal,
        mixedCashAmount,
        discountsTotal,
        cashIn,
        cashOut,
        expensesTotal,
        cashSales,
        totalRevenue,
        totalOpeningCash,
        expectedCash,
        totalCountedCash,
        difference,
      },
      topServices: Array.from(serviceMap.values()).sort((a, b) => b.count - a.count).slice(0, 10),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
