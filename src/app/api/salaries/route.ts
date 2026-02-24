import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";

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
      include: {
        salarySettings: true,
        visits: {
          where: { visitAt: { gte: periodStart, lte: periodEnd } },
          select: { total: true },
        },
        penalties: {
          where: { date: { gte: periodStart, lte: periodEnd } },
          select: { amount: true, reason: true, date: true, id: true },
        },
      },
      orderBy: { name: "asc" },
    });

    const payroll = barbers.map((barber) => {
      const settings = barber.salarySettings;
      const visitTotal = barber.visits.reduce((s, v) => s + v.total, 0);
      const visitCount = barber.visits.length;

      let commission = 0;
      if (settings) {
        if (settings.commissionType === "PERCENT") {
          commission = (visitTotal * settings.commissionValue) / 100;
        } else {
          commission = visitCount * settings.commissionValue;
        }
      }

      const baseSalary = settings?.baseSalary ?? 0;
      const gross = baseSalary + commission;
      const penaltiesTotal = barber.penalties.reduce((s, p) => s + p.amount, 0);
      const net = gross - penaltiesTotal;

      return {
        barberId: barber.id,
        name: barber.name,
        baseSalary,
        commissionType: settings?.commissionType ?? "PERCENT",
        commissionValue: settings?.commissionValue ?? 0,
        visitCount,
        visitTotal,
        commission,
        gross,
        penaltiesTotal,
        penalties: barber.penalties,
        net,
      };
    });

    return NextResponse.json(payroll);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
