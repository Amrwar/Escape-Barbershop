import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { getVisaCommissionPercent, visaCommissionOn, round2 } from "@/lib/finance";
import { paymentSplit } from "@/lib/payments";

export async function GET(req: NextRequest) {
  try {
    await requireOwner();
    const { searchParams } = req.nextUrl;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const barberIdParam = searchParams.get("barberId");

    if (!from || !to) {
      return NextResponse.json({ error: "from and to are required" }, { status: 400 });
    }

    const effectiveBarberId = barberIdParam || undefined;

    const dateFilter = {
      gte: new Date(from),
      lte: new Date(to),
    };

    const [visits, penalties, expenses, advances] = await Promise.all([
      prisma.visit.findMany({
        where: {
          visitAt: dateFilter,
          ...(effectiveBarberId ? { barberId: effectiveBarberId } : {}),
        },
        orderBy: { visitAt: "desc" },
        include: {
          customer: true,
          barber: true,
          items: { include: { service: true } },
        },
      }),
      prisma.penalty.findMany({
        where: {
          date: dateFilter,
          ...(effectiveBarberId ? { barberId: effectiveBarberId } : {}),
        },
        orderBy: { date: "desc" },
        include: { barber: { select: { name: true } } },
      }),
      // Only fetch expenses when viewing all barbers (not filtered to one barber)
      !effectiveBarberId
        ? prisma.expense.findMany({ where: { date: dateFilter }, orderBy: { date: "desc" } }).catch(() => [])
        : Promise.resolve([]),
      // Advances are a payroll matter: listed here as a memo, never as an expense
      prisma.advance
        .findMany({
          where: { date: dateFilter, ...(effectiveBarberId ? { barberId: effectiveBarberId } : {}) },
          orderBy: { date: "desc" },
          include: { barber: { select: { name: true } } },
        })
        .catch(() => []),
    ]);

    // Compute summary
    const visitCount = visits.length;
    let totalRevenue = 0;
    let cashTotal = 0;
    let cardTotal = 0;
    let instapayTotal = 0;
    let discountsTotal = 0;
    let tipsTotal = 0;
    const serviceCountMap = new Map<string, { name: string; arabicName: string | null; count: number; revenue: number }>();

    for (const v of visits) {
      totalRevenue += v.total;
      const paid = paymentSplit(v);
      cashTotal += paid.cash;
      cardTotal += paid.card;
      instapayTotal += paid.instapay;

      tipsTotal += (v as { tip?: number }).tip ?? 0;

      // Compute subtotal to derive discount amount
      const subtotal = v.items.reduce((s, i) => s + i.priceAtTime * i.quantity, 0);
      discountsTotal += subtotal - v.total;

      for (const item of v.items) {
        const key = item.serviceId;
        const existing = serviceCountMap.get(key);
        const itemRevenue = item.priceAtTime * item.quantity;
        if (existing) {
          existing.count += item.quantity;
          existing.revenue += itemRevenue;
        } else {
          serviceCountMap.set(key, {
            name: item.service.name,
            arabicName: item.service.arabicName ?? null,
            count: item.quantity,
            revenue: itemRevenue,
          });
        }
      }
    }

    const topServices = Array.from(serviceCountMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Compute per-barber breakdown
    const barberMap = new Map<
      string,
      { barberId: string; barberName: string; visitCount: number; revenue: number; commissionableRevenue: number; services: Map<string, { name: string; count: number }> }
    >();

    for (const v of visits) {
      const key = v.barberId ?? "unknown";
      let entry = barberMap.get(key);
      if (!entry) {
        entry = {
          barberId: v.barberId ?? "unknown",
          barberName: v.barber?.name ?? "Unknown",
          visitCount: 0,
          revenue: 0,
          commissionableRevenue: 0,
          services: new Map(),
        };
        barberMap.set(key, entry);
      }
      const e = barberMap.get(key)!;
      e.visitCount++;
      e.revenue += v.total;

      // Commissionable portion of this visit
      const allSubtotal = v.items.reduce((s, i) => s + i.priceAtTime * i.quantity, 0);
      const commSubtotal = v.items
        .filter((i) => !i.service.excludeFromCommission)
        .reduce((s, i) => s + i.priceAtTime * i.quantity, 0);
      const factor = allSubtotal > 0 ? v.total / allSubtotal : 1;
      e.commissionableRevenue += commSubtotal * factor;

      for (const item of v.items) {
        const svc = e.services.get(item.serviceId);
        if (svc) {
          svc.count += item.quantity;
        } else {
          e.services.set(item.serviceId, { name: item.service.name, count: item.quantity });
        }
      }
    }

    const perBarber = Array.from(barberMap.values()).map((b) => ({
      barberId: b.barberId,
      barberName: b.barberName,
      visitCount: b.visitCount,
      revenue: b.revenue,
      commissionableRevenue: b.commissionableRevenue,
      services: Array.from(b.services.values()).sort((a, c) => c.count - a.count),
    }));

    const penaltiesOut = penalties.map((p) => ({
      id: p.id,
      date: p.date,
      barberId: p.barberId,
      barberName: p.barber.name,
      amount: p.amount,
      reason: p.reason,
    }));

    type ExpenseRow = {
      id: string;
      date: Date;
      amount: number;
      reason: string;
      paymentMethod?: string;
      category?: string | null;
    };
    const expenseRows = expenses as ExpenseRow[];
    const cashExpenses = expenseRows
      .filter((e) => e.paymentMethod !== "CARD")
      .reduce((s, e) => s + e.amount, 0);
    const cardExpenses = expenseRows
      .filter((e) => e.paymentMethod === "CARD")
      .reduce((s, e) => s + e.amount, 0);
    const expensesTotal = cashExpenses + cardExpenses;
    const expensesOut = expenseRows.map((e) => ({
      id: e.id,
      date: e.date,
      amount: e.amount,
      reason: e.reason,
      paymentMethod: e.paymentMethod ?? "CASH",
      category: e.category ?? null,
    }));

    // Card-machine commission on everything collected by card in the period.
    const visaPercent = await getVisaCommissionPercent();
    const visaCommission = visaCommissionOn(cardTotal, visaPercent);

    type AdvanceRow = {
      id: string;
      date: Date;
      amount: number;
      barberId: string;
      paymentMethod: string;
      notes: string | null;
      barber: { name: string } | null;
    };
    const advanceRows = advances as AdvanceRow[];
    const advancesTotal = advanceRows.reduce((s, a) => s + a.amount, 0);
    const advancesOut = advanceRows.map((a) => ({
      id: a.id,
      date: a.date,
      barberId: a.barberId,
      barberName: a.barber?.name ?? "",
      amount: a.amount,
      paymentMethod: a.paymentMethod,
      notes: a.notes,
    }));
    const penaltiesTotal = penaltiesOut.reduce((s, p) => s + p.amount, 0);

    return NextResponse.json({
      visits,
      summary: {
        visitCount,
        totalRevenue,
        cashTotal: cashTotal - tipsTotal,
        cardTotal,
        instapayTotal,
        tipsTotal,
        discountsTotal,
        expensesTotal,
        cashExpenses,
        cardExpenses,
        visaPercent,
        visaCommission,
        cardNet: round2(cardTotal - visaCommission - cardExpenses),
        // Net revenue carries the two real costs of the period: what was spent,
        // and what the card machine took. Advances and penalties are payroll
        // items and are reported separately below.
        netRevenue: round2(totalRevenue - expensesTotal - visaCommission),
        advancesTotal,
        penaltiesTotal,
        topServices,
      },
      perBarber,
      penalties: penaltiesOut,
      expenses: expensesOut,
      advances: advancesOut,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
