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
    const periodEnd = new Date(year, month, 0);

    const records = await prisma.attendance.findMany({
      where: { date: { gte: periodStart, lte: periodEnd } },
      select: { barberId: true, date: true },
    });

    // Build map: barberId → array of "YYYY-MM-DD" strings
    const map: Record<string, string[]> = {};
    for (const rec of records) {
      if (!map[rec.barberId]) map[rec.barberId] = [];
      map[rec.barberId].push(rec.date.toISOString().slice(0, 10));
    }

    return NextResponse.json(map);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireOwner();
    const { barberId, date } = await req.json();

    if (!barberId || !date) {
      return NextResponse.json({ error: "barberId and date required" }, { status: 400 });
    }

    // Parse as UTC midnight to match @db.Date storage
    const dateObj = new Date(date + "T00:00:00.000Z");

    const existing = await prisma.attendance.findUnique({
      where: { barberId_date: { barberId, date: dateObj } },
    });

    if (existing) {
      await prisma.attendance.delete({ where: { id: existing.id } });
      return NextResponse.json({ absent: false });
    } else {
      await prisma.attendance.create({ data: { barberId, date: dateObj } });
      return NextResponse.json({ absent: true });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
