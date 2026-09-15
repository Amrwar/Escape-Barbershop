import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = req.nextUrl;
    const barberId = searchParams.get("barberId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!barberId || !from || !to) {
      return NextResponse.json({ error: "barberId, from, and to are required" }, { status: 400 });
    }

    const dateFilter = { gte: new Date(from), lte: new Date(to) };

    const [visits, penalties, attendance] = await Promise.all([
      prisma.visit.findMany({
        where: { barberId, visitAt: dateFilter },
        orderBy: { visitAt: "desc" },
        include: {
          customer: true,
          barber: true,
          items: { include: { service: true } },
        },
      }),
      prisma.penalty.findMany({
        where: { barberId, date: dateFilter },
        orderBy: { date: "desc" },
      }),
      prisma.attendance.findMany({
        where: { barberId, date: dateFilter },
        orderBy: { date: "asc" },
        select: { date: true },
      }),
    ]);

    let totalRevenue = 0;
    let cashTotal = 0;
    let cardTotal = 0;
    let instapayTotal = 0;
    let mixedTotal = 0;
    let discountsTotal = 0;
    const serviceMap = new Map<string, { name: string; arabicName: string | null; count: number; revenue: number }>();

    for (const v of visits) {
      totalRevenue += v.total;
      if (v.paymentMethod === "CASH") cashTotal += v.total;
      else if (v.paymentMethod === "CARD") cardTotal += v.total;
      else if (v.paymentMethod === "INSTAPAY") instapayTotal += v.total;
      else mixedTotal += v.total;

      const subtotal = v.items.reduce((s, i) => s + i.priceAtTime * i.quantity, 0);
      discountsTotal += subtotal - v.total;

      for (const item of v.items) {
        const existing = serviceMap.get(item.serviceId);
        const itemRevenue = item.priceAtTime * item.quantity;
        if (existing) {
          existing.count += item.quantity;
          existing.revenue += itemRevenue;
        } else {
          serviceMap.set(item.serviceId, {
            name: item.service.name,
            arabicName: item.service.arabicName ?? null,
            count: item.quantity,
            revenue: itemRevenue,
          });
        }
      }
    }

    const topServices = Array.from(serviceMap.values()).sort((a, b) => b.count - a.count);

    return NextResponse.json({
      visits,
      summary: {
        visitCount: visits.length,
        totalRevenue,
        cashTotal,
        cardTotal,
        instapayTotal,
        mixedTotal,
        discountsTotal,
        topServices,
      },
      penalties: penalties.map((p) => ({
        date: p.date,
        amount: p.amount,
        reason: p.reason,
      })),
      absentDays: attendance.map((a) => a.date.toISOString().slice(0, 10)),
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
