import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { round2 } from "@/lib/finance";

/**
 * Every visit that was given a discount, with what was sold and what the
 * discount cost. Owner-only: it exists to review the till, not to be read by it.
 *
 * `Visit.discount` is a percentage and `Visit.total` already has it applied, so
 * the money given away is subtotal - total.
 */
export async function GET(req: NextRequest) {
  try {
    await requireOwner();
    const { searchParams } = req.nextUrl;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const barberId = searchParams.get("barberId");

    const dateFilter =
      from || to
        ? { visitAt: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } }
        : {};

    const [discounted, allInRange] = await Promise.all([
      prisma.visit.findMany({
        where: { ...dateFilter, discount: { gt: 0 }, ...(barberId ? { barberId } : {}) },
        orderBy: { visitAt: "desc" },
        include: {
          customer: { select: { name: true, phone: true } },
          barber: { select: { id: true, name: true } },
          createdBy: { select: { name: true } },
          items: { include: { service: { select: { name: true, arabicName: true } } } },
        },
      }),
      // the denominator: what the same period took in overall
      prisma.visit.findMany({
        where: { ...dateFilter, ...(barberId ? { barberId } : {}) },
        select: { total: true },
      }),
    ]);

    const rows = discounted.map((v) => {
      const subtotal = round2(v.items.reduce((s, i) => s + i.priceAtTime * i.quantity, 0));
      const discountAmount = round2(subtotal - v.total);
      return {
        id: v.id,
        visitAt: v.visitAt,
        receiptNo: v.sessionSequence,
        customerName: v.customer.name,
        barberId: v.barberId,
        barberName: v.barber?.name ?? null,
        recordedBy: v.createdBy?.name ?? null,
        paymentMethod: v.paymentMethod,
        discountPercent: v.discount,
        subtotal,
        discountAmount,
        total: v.total,
        tip: v.tip,
        notes: v.notes,
        items: v.items.map((i) => ({
          name: i.service.name,
          arabicName: i.service.arabicName,
          quantity: i.quantity,
          price: i.priceAtTime,
          lineTotal: round2(i.priceAtTime * i.quantity),
        })),
      };
    });

    const discountTotal = round2(rows.reduce((s, r) => s + r.discountAmount, 0));
    const subtotalTotal = round2(rows.reduce((s, r) => s + r.subtotal, 0));
    const periodRevenue = round2(allInRange.reduce((s, v) => s + v.total, 0));

    // who gave them away, so a pattern is visible at a glance
    const perBarber = new Map<string, { barberName: string; count: number; amount: number }>();
    for (const r of rows) {
      const key = r.barberName ?? "—";
      const e = perBarber.get(key) ?? { barberName: key, count: 0, amount: 0 };
      e.count += 1;
      e.amount = round2(e.amount + r.discountAmount);
      perBarber.set(key, e);
    }

    return NextResponse.json({
      rows,
      perBarber: Array.from(perBarber.values()).sort((a, b) => b.amount - a.amount),
      summary: {
        discountedVisits: rows.length,
        totalVisits: allInRange.length,
        discountTotal,
        subtotalTotal,
        periodRevenue,
        averagePercent: rows.length
          ? round2(rows.reduce((s, r) => s + r.discountPercent, 0) / rows.length)
          : 0,
        shareOfRevenue: periodRevenue > 0 ? round2((discountTotal / periodRevenue) * 100) : 0,
      },
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[discounts]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
