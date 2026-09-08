import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { penaltySchema } from "@/lib/validations";
import { recordAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  try {
    await requireOwner();
    const barberId = req.nextUrl.searchParams.get("barberId");
    const month = req.nextUrl.searchParams.get("month");
    const year = req.nextUrl.searchParams.get("year");

    let dateFilter = {};
    if (month && year) {
      const start = new Date(parseInt(year), parseInt(month) - 1, 1);
      const end = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59);
      dateFilter = { date: { gte: start, lte: end } };
    }

    const penalties = await prisma.penalty.findMany({
      where: {
        ...(barberId && { barberId }),
        ...dateFilter,
      },
      orderBy: { date: "desc" },
      include: { barber: true },
    });
    return NextResponse.json(penalties);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authSession = await requireOwner();
    const body = await req.json();
    const data = penaltySchema.parse(body);

    const penalty = await prisma.penalty.create({
      data: {
        barberId: data.barberId,
        date: new Date(data.date),
        amount: data.amount,
        reason: data.reason,
      },
      include: { barber: true },
    });
    await recordAudit(authSession, {
      action: "CREATE",
      entity: "PENALTY",
      entityId: penalty.id,
      amount: penalty.amount,
      summary: `${penalty.amount.toFixed(2)} on ${penalty.barber?.name ?? "—"} - ${penalty.reason}`,
    });

    return NextResponse.json(penalty, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }
}
