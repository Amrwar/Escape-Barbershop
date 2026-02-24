import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = req.nextUrl;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const barberIdParam = searchParams.get("barberId");

    if (!from || !to) {
      return NextResponse.json({ error: "from and to are required" }, { status: 400 });
    }

    // BARBER role is always forced to their own barberId
    const effectiveBarberId =
      session.user.role === "BARBER"
        ? session.user.barberId
        : barberIdParam || undefined;

    const dateFilter = {
      gte: new Date(from),
      lte: new Date(to),
    };

    const [visits, penalties] = await Promise.all([
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
    ]);

    // Compute summary
    const visitCount = visits.length;
    let totalRevenue = 0;
    let cashTotal = 0;
    let cardTotal = 0;
    let mixedTotal = 0;
    let discountsTotal = 0;
    const serviceCountMap = new Map<string, { name: string; arabicName: string | null; count: number; revenue: number }>();

    for (const v of visits) {
      totalRevenue += v.total;
      if (v.paymentMethod === "CASH") cashTotal += v.total;
      else if (v.paymentMethod === "CARD") cardTotal += v.total;
      else mixedTotal += v.total;

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
      { barberId: string; barberName: string; visitCount: number; revenue: number; services: Map<string, { name: string; count: number }> }
    >();

    for (const v of visits) {
      const key = v.barberId;
      let entry = barberMap.get(key);
      if (!entry) {
        entry = {
          barberId: v.barberId,
          barberName: v.barber.name,
          visitCount: 0,
          revenue: 0,
          services: new Map(),
        };
        barberMap.set(key, entry);
      }
      entry.visitCount++;
      entry.revenue += v.total;
      for (const item of v.items) {
        const svc = entry.services.get(item.serviceId);
        if (svc) {
          svc.count += item.quantity;
        } else {
          entry.services.set(item.serviceId, { name: item.service.name, count: item.quantity });
        }
      }
    }

    const perBarber = Array.from(barberMap.values()).map((b) => ({
      barberId: b.barberId,
      barberName: b.barberName,
      visitCount: b.visitCount,
      revenue: b.revenue,
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

    return NextResponse.json({
      visits,
      summary: {
        visitCount,
        totalRevenue,
        cashTotal,
        cardTotal,
        mixedTotal,
        discountsTotal,
        topServices,
      },
      perBarber,
      penalties: penaltiesOut,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
