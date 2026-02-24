import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();

    const session = await prisma.cashDrawerSession.findUnique({
      where: { id: params.id },
      include: {
        openedBy: { select: { name: true } },
        closedBy: { select: { name: true } },
        movements: {
          orderBy: { createdAt: "asc" },
          include: { createdBy: { select: { name: true } } },
        },
        visits: {
          orderBy: { visitAt: "asc" },
          include: {
            customer: { select: { name: true } },
            barber: { select: { name: true, id: true } },
            items: { include: { service: { select: { name: true } } } },
          },
        },
      },
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Revenue totals
    const cashTotal = session.visits
      .filter((v) => v.paymentMethod === "CASH")
      .reduce((s, v) => s + (v.cashAmount ?? v.total), 0);

    const cardTotal = session.visits
      .filter((v) => v.paymentMethod === "CARD")
      .reduce((s, v) => s + (v.cardAmount ?? v.total), 0);

    const mixedCashAmount = session.visits
      .filter((v) => v.paymentMethod === "MIXED")
      .reduce((s, v) => s + (v.cashAmount ?? 0), 0);

    const discountsTotal = session.visits.reduce((s, v) => {
      const subtotal = v.items.reduce(
        (sum, i) => sum + i.priceAtTime * i.quantity,
        0
      );
      return s + ((subtotal * v.discount) / 100);
    }, 0);

    const cashSales = cashTotal + mixedCashAmount;

    const cashIn = session.movements
      .filter((m) => m.type === "IN")
      .reduce((s, m) => s + m.amount, 0);

    const cashOut = session.movements
      .filter((m) => m.type === "OUT")
      .reduce((s, m) => s + m.amount, 0);

    const expectedCash = session.openingCash + cashSales + cashIn - cashOut;
    const countedCash = session.closingCashCounted ?? null;
    const difference = countedCash !== null ? countedCash - expectedCash : null;

    // Revenue per barber
    const barberMap = new Map<
      string,
      { barberId: string; name: string; revenue: number; visits: number }
    >();
    for (const v of session.visits) {
      const existing = barberMap.get(v.barberId);
      if (existing) {
        existing.revenue += v.total;
        existing.visits += 1;
      } else {
        barberMap.set(v.barberId, {
          barberId: v.barberId,
          name: v.barber.name,
          revenue: v.total,
          visits: 1,
        });
      }
    }

    // Top services
    const serviceMap = new Map<
      string,
      { serviceId: string; name: string; count: number }
    >();
    for (const v of session.visits) {
      for (const item of v.items) {
        const existing = serviceMap.get(item.serviceId);
        if (existing) {
          existing.count += item.quantity;
        } else {
          serviceMap.set(item.serviceId, {
            serviceId: item.serviceId,
            name: item.service.name,
            count: item.quantity,
          });
        }
      }
    }

    return NextResponse.json({
      session: {
        id: session.id,
        openedAt: session.openedAt,
        closedAt: session.closedAt,
        status: session.status,
        openingCash: session.openingCash,
        closingCashCounted: session.closingCashCounted,
        notes: session.notes,
        openedBy: session.openedBy,
        closedBy: session.closedBy,
      },
      summary: {
        visitCount: session.visits.length,
        cashTotal,
        cardTotal,
        mixedCashAmount,
        discountsTotal,
        cashIn,
        cashOut,
        cashSales,
        expectedCash,
        countedCash,
        difference,
      },
      movements: session.movements,
      visits: session.visits,
      revenuePerBarber: Array.from(barberMap.values()).sort(
        (a, b) => b.revenue - a.revenue
      ),
      topServices: Array.from(serviceMap.values()).sort((a, b) => b.count - a.count),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
