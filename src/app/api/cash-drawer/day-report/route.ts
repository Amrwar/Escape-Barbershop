import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { getVisaCommissionPercent, visaCommissionOn, round2 } from "@/lib/finance";
import { drawerSales, outflowAccount } from "@/lib/payments";
import { shopDateISO, shopTime } from "@/lib/booking";

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
// The shop's business day: its own midnight through to 3AM the next morning.
      // Shop time, not the server's — the server may be in another country, and a
      // late night's takings belong to the night the shop worked.
      const dateISO = dateParam ?? shopDateISO(Date.now());
      from = new Date(shopTime(dateISO, 0));
      to = new Date(shopTime(dateISO, 27 * 60));
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

    const sumFrom = (rows: { amount: number; paymentMethod: string }[], account: "cash" | "card" | "instapay") =>
      rows.filter((r) => outflowAccount(r.paymentMethod) === account).reduce((s, r) => s + r.amount, 0);
    const cashExpenses = sumFrom(expenseRows, "cash");
    const cardExpenses = sumFrom(expenseRows, "card");
    const instapayExpenses = sumFrom(expenseRows, "instapay");
    const expensesTotal = cashExpenses + cardExpenses + instapayExpenses;
    const cashAdvances = sumFrom(advanceRows, "cash");
    const cardAdvances = sumFrom(advanceRows, "card");
    const instapayAdvances = sumFrom(advanceRows, "instapay");
    const advancesTotal = cashAdvances + cardAdvances + instapayAdvances;

    let totalVisits = 0;
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

    // InstaPay goes to the bank, so only the cash side can move the drawer
    const sales = drawerSales(sessions.flatMap((s) => s.visits));
    const { cashSales, cardSales, instapaySales } = sales;
    const totalRevenue = cashSales + cardSales + instapaySales;

    const visaPercent = await getVisaCommissionPercent();
    const visaCommission = visaCommissionOn(cardSales, visaPercent);
    const cardNet = round2(cardSales - visaCommission - cardExpenses - cardAdvances);
    const instapayNet = round2(instapaySales - instapayExpenses - instapayAdvances);

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
        cashTotal: sales.cashTotal,
        cardTotal: sales.cardTotal,
        instapayTotal: sales.instapayTotal,
        mixedCashAmount: sales.mixedCash,
        mixedCardAmount: sales.mixedCard,
        mixedInstapayAmount: sales.mixedInstapay,
        discountsTotal,
        cashIn,
        cashOut,
        expensesTotal,
        cashExpenses,
        cardExpenses,
        instapayExpenses,
        advancesTotal,
        cashAdvances,
        cardAdvances,
        instapayAdvances,
        visaPercent,
        visaCommission,
        cashSales,
        cardSales,
        instapaySales,
        instapayNet,
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
