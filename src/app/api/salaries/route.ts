import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { earningsFor } from "@/lib/payroll";

export async function GET(req: NextRequest) {
  try {
    await requireOwner();
    const month = parseInt(req.nextUrl.searchParams.get("month") ?? "0");
    const year = parseInt(req.nextUrl.searchParams.get("year") ?? "0");

    if (!month || !year) {
      return NextResponse.json({ error: "month and year required" }, { status: 400 });
    }

    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0, 23, 59, 59);

    const barbers = await prisma.barber.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: {
        salarySettings: true,
        visits: {
          where: { visitAt: { gte: periodStart, lte: periodEnd } },
          select: {
            total: true,
            discount: true,
            items: {
              select: {
                priceAtTime: true,
                quantity: true,
                service: { select: { excludeFromCommission: true } },
              },
            },
          },
        },
        penalties: {
          where: { date: { gte: periodStart, lte: periodEnd } },
          select: { amount: true, reason: true, date: true, id: true },
        },
        advances: {
          where: { date: { gte: periodStart, lte: periodEnd } },
          select: { amount: true, paymentMethod: true, notes: true, date: true, id: true },
        },
        attendance: {
          where: { date: { gte: periodStart, lte: periodEnd } },
        },
      },
    });

    const payroll = barbers.map((barber) => {
      const settings = barber.salarySettings;
      const { visitCount, visitTotal, commissionableTotal, commission } = earningsFor(barber.visits, settings);

      const baseSalary = settings?.baseSalary ?? 0;
      const gross = baseSalary + commission;
      // Penalties and advances are recovered here and nowhere else: neither one
      // is ever charged against daily revenue.
      const penaltiesTotal = barber.penalties.reduce((s, p) => s + p.amount, 0);
      const advancesTotal = barber.advances.reduce((s, a) => s + a.amount, 0);
      const absentDays = barber.attendance.length;
      const dailyRate = baseSalary / 30;
      const attendanceDeduction = absentDays * dailyRate;
      const net = gross - penaltiesTotal - advancesTotal - attendanceDeduction;

      return {
        barberId: barber.id,
        name: barber.name,
        barberPhone: barber.phone ?? null,
        baseSalary,
        commissionType: settings?.commissionType ?? "PERCENT",
        commissionValue: settings?.commissionValue ?? 0,
        visitCount,
        visitTotal,
        commissionableTotal,
        commission,
        gross,
        penaltiesTotal,
        penalties: barber.penalties,
        advancesTotal,
        advances: barber.advances,
        absentDays,
        dailyRate,
        attendanceDeduction,
        net,
      };
    });

    return NextResponse.json(payroll);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
