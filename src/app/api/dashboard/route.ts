import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  try {
    const session = await requireAuth();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const barberFilter =
      session.user.role === "BARBER" && session.user.barberId
        ? { barberId: session.user.barberId }
        : {};

    const [todayVisits, monthVisits, topServices, revenuePerBarber] =
      await Promise.all([
        prisma.visit.findMany({
          where: { visitAt: { gte: todayStart }, ...barberFilter },
          select: { total: true },
        }),
        prisma.visit.findMany({
          where: {
            visitAt: { gte: monthStart, lte: monthEnd },
            ...barberFilter,
          },
          select: { total: true },
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
        session.user.role === "OWNER"
          ? prisma.visit.groupBy({
              by: ["barberId"],
              where: { visitAt: { gte: monthStart, lte: monthEnd } },
              _sum: { total: true },
              _count: { id: true },
            })
          : Promise.resolve([]),
      ]);

    // Enrich top services with names
    const serviceIds = topServices.map((s) => s.serviceId);
    const services = await prisma.service.findMany({
      where: { id: { in: serviceIds } },
      select: { id: true, name: true },
    });
    const serviceMap = Object.fromEntries(services.map((s) => [s.id, s.name]));

    // Enrich revenue per barber with names
    const barberIds = (revenuePerBarber as Array<{ barberId: string }>).map(
      (b) => b.barberId
    );
    const barbers = await prisma.barber.findMany({
      where: { id: { in: barberIds } },
      select: { id: true, name: true },
    });
    const barberMap = Object.fromEntries(barbers.map((b) => [b.id, b.name]));

    return NextResponse.json({
      todayRevenue: todayVisits.reduce((s, v) => s + v.total, 0),
      monthRevenue: monthVisits.reduce((s, v) => s + v.total, 0),
      visitsToday: todayVisits.length,
      visitsThisMonth: monthVisits.length,
      topServices: topServices.map((s) => ({
        serviceId: s.serviceId,
        name: serviceMap[s.serviceId] ?? "Unknown",
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
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
