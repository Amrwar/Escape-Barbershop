import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { getVisaCommissionPercent, visaCommissionOn, round2 } from "@/lib/finance";

export async function GET(req: NextRequest) {
  try {
    const authSession = await requireAuth();
    const isOwner = authSession.user.role === "OWNER";

    const fromParam = req.nextUrl.searchParams.get("from");
    const toParam = req.nextUrl.searchParams.get("to");
    // Legacy: fall back to date param for backward compat
    const dateParam = req.nextUrl.searchParams.get("date");
    let from: Date, to: Date;
    if (fromParam && toParam) {
      from = new Date(fromParam);
      to = new Date(toParam);
    } else {
      // Business day: midnight of date → 3AM of next day
      const date = dateParam ? new Date(dateParam + "T00:00:00") : new Date();
      date.setHours(0, 0, 0, 0);
      from = date;
      to = new Date(date); to.setDate(to.getDate() + 1); to.setHours(3, 0, 0, 0);
    }

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

    // Everything that left the till or the card account during the day.
    // Expenses are real costs; advances are recovered from payroll, so they move
    // money without ever reducing revenue. Penalties appear in neither.
    const [expenseRows, advanceRows] = await Promise.all([
      prisma.expense
        .findMany({ where: { date: { gte: from, lte: to } }, orderBy: { date: "asc" } })
        .catch(() => [] as { id: string; date: Date; amount: number; reason: string; paymentMethod: string; category: string | null }[]),
      prisma.advance
        .findMany({
          where: { date: { gte: from, lte: to } },
          orderBy: { date: "asc" },
          include: { barber: { select: { name: true } } },
        })
        .catch(() => [] as { id: string; date: Date; amount: number; paymentMethod: string; notes: string | null; barber: { name: string } }[]),
    ]);

    const cashExpenses = expenseRows.filter((e) => e.paymentMethod !== "CARD").reduce((s, e) => s + e.amount, 0);
    const cardExpenses = expenseRows.filter((e) => e.paymentMethod === "CARD").reduce((s, e) => s + e.amount, 0);
    const expensesTotal = cashExpenses + cardExpenses;
    const cashAdvances = advanceRows.filter((a) => a.paymentMethod !== "CARD").reduce((s, a) => s + a.amount, 0);
    const cardAdvances = advanceRows.filter((a) => a.paymentMethod === "CARD").reduce((s, a) => s + a.amount, 0);
    const advancesTotal = cashAdvances + cardAdvances;

    let totalVisits = 0;
    let cashTotal = 0;
    let cardTotal = 0;
    let mixedCashAmount = 0;
    let mixedCardAmount = 0;
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
        // Cash/MIXED tips flow into cash drawer; card tips are deducted as CashMovement OUT
        if (v.paymentMethod === "CASH") cashTotal += (v.cashAmount ?? v.total) + (v.tip ?? 0);
        else if (v.paymentMethod === "CARD") cardTotal += v.cardAmount ?? v.total;
        else if (v.paymentMethod === "MIXED") {
          mixedCashAmount += (v.cashAmount ?? 0) + (v.tip ?? 0);
          mixedCardAmount += v.cardAmount ?? 0;
        }

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
    const cardSales = cardTotal + mixedCardAmount;
    const totalRevenue = cashSales + cardSales;

    const visaPercent = await getVisaCommissionPercent();
    const visaCommission = visaCommissionOn(cardSales, visaPercent);
    const cardNet = round2(cardSales - visaCommission - cardExpenses - cardAdvances);

    const expectedCash = round2(
      totalOpeningCash + cashSales + cashIn - cashOut - cashExpenses - cashAdvances
    );
    const difference = totalCountedCash !== null ? round2(totalCountedCash - expectedCash) : null;
    const netRevenue = round2(totalRevenue - expensesTotal - visaCommission);

    // Warehouse activity for the same window, so the journal shows what the
    // purchases and issue notes did. Cash/card invoices are already inside
    // `expensesTotal` through the expense they posted.
    const [purchases, transfers] = await Promise.all([
      prisma.purchaseInvoice
        .findMany({
          where: { date: { gte: from, lte: to } },
          orderBy: { date: "asc" },
          include: { supplier: { select: { name: true } } },
        })
        .catch(() => []),
      prisma.stockTransfer
        .findMany({ where: { date: { gte: from, lte: to } }, include: { items: true } })
        .catch(() => []),
    ]);

    const purchasesSummary = purchases.reduce(
      (acc, p) => {
        acc.total += p.total;
        if (p.paymentType === "CASH") acc.cash += p.total;
        else if (p.paymentType === "CARD") acc.card += p.total;
        else acc.credit += p.total;
        return acc;
      },
      { total: 0, cash: 0, card: 0, credit: 0 }
    );

    // The cashier reconciles the till, so they see the cash and card movement.
    // Profit and the purchase ledger are owner business.
    const ownerOnly = isOwner
      ? {
          netRevenue,
          advances: advanceRows.map((a) => ({
            id: a.id,
            date: a.date,
            amount: a.amount,
            paymentMethod: a.paymentMethod,
            barberName: a.barber?.name ?? "",
            notes: a.notes,
          })),
          purchases: {
            summary: purchasesSummary,
            rows: purchases.map((p) => ({
              id: p.id,
              date: p.date,
              number: p.number,
              supplierName: p.supplier?.name ?? null,
              paymentType: p.paymentType,
              total: p.total,
            })),
          },
        }
      : {};

    return NextResponse.json({
      date: from.toISOString(),
      isOwner,
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
        mixedCardAmount,
        discountsTotal,
        cashIn,
        cashOut,
        expensesTotal,
        cashExpenses,
        cardExpenses,
        advancesTotal,
        cashAdvances,
        cardAdvances,
        visaPercent,
        visaCommission,
        cashSales,
        cardSales,
        cardNet,
        totalRevenue,
        ...(isOwner ? { netRevenue } : {}),
        totalOpeningCash,
        expectedCash,
        totalCountedCash,
        difference,
      },
      expenses: expenseRows.map((e) => ({
        id: e.id,
        date: e.date,
        amount: e.amount,
        reason: e.reason,
        paymentMethod: e.paymentMethod,
        category: e.category,
      })),
      ...ownerOnly,
      transfersCount: transfers.length,
      topServices: Array.from(serviceMap.values()).sort((a, b) => b.count - a.count).slice(0, 10),
    });
  } catch (err) {
    console.error("[day-report]", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
