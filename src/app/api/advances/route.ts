import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { advanceSchema } from "@/lib/validations";

// Salary advances (سلف). Owner-only: an advance is a payroll matter, not a till
// operation — it leaves the drawer but is recovered from the barber's salary.
export async function GET(req: NextRequest) {
  try {
    await requireOwner();
    const { searchParams } = req.nextUrl;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const barberId = searchParams.get("barberId");
    const month = searchParams.get("month");
    const year = searchParams.get("year");

    let dateFilter: { gte?: Date; lte?: Date } | undefined;
    if (month && year) {
      dateFilter = {
        gte: new Date(parseInt(year), parseInt(month) - 1, 1),
        lte: new Date(parseInt(year), parseInt(month), 0, 23, 59, 59),
      };
    } else if (from || to) {
      dateFilter = {
        ...(from && { gte: new Date(from) }),
        ...(to && { lte: new Date(to) }),
      };
    }

    const advances = await prisma.advance.findMany({
      where: {
        ...(barberId ? { barberId } : {}),
        ...(dateFilter ? { date: dateFilter } : {}),
      },
      orderBy: { date: "desc" },
      include: { barber: { select: { id: true, name: true } } },
    });

    return NextResponse.json(advances);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[advances GET]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireOwner();
    const data = advanceSchema.parse(await req.json());

    const advance = await prisma.advance.create({
      data: {
        barberId: data.barberId,
        date: new Date(data.date),
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        notes: data.notes?.trim() || null,
      },
      include: { barber: { select: { id: true, name: true } } },
    });

    return NextResponse.json(advance, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }
}
