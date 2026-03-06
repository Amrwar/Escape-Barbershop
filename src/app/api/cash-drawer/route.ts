import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireOwner } from "@/lib/auth";
import { openDrawerSchema } from "@/lib/validations";

export async function GET() {
  try {
    await requireAuth();

    const session = await prisma.cashDrawerSession.findFirst({
      where: { status: "OPEN" },
      include: {
        openedBy: { select: { name: true } },
        movements: {
          orderBy: { createdAt: "asc" },
          include: { createdBy: { select: { name: true } } },
        },
        visits: {
          select: {
            id: true,
            total: true,
            cashAmount: true,
            cardAmount: true,
            paymentMethod: true,
          },
        },
      },
    });

    if (!session) return NextResponse.json(null);

    const cashTotal = session.visits
      .filter((v) => v.paymentMethod === "CASH")
      .reduce((s, v) => s + (v.cashAmount ?? v.total), 0);

    const cardTotal = session.visits
      .filter((v) => v.paymentMethod === "CARD")
      .reduce((s, v) => s + (v.cardAmount ?? v.total), 0);

    const mixedCash = session.visits
      .filter((v) => v.paymentMethod === "MIXED")
      .reduce((s, v) => s + (v.cashAmount ?? 0), 0);

    const cashSales = cashTotal + mixedCash;

    const cashIn = session.movements
      .filter((m) => m.type === "IN")
      .reduce((s, m) => s + m.amount, 0);

    const cashOut = session.movements
      .filter((m) => m.type === "OUT")
      .reduce((s, m) => s + m.amount, 0);

    // Expenses logged during this session's time window
    const expenses = await prisma.expense.findMany({
      where: {
        date: {
          gte: session.openedAt,
          lte: new Date(),
        },
      },
    });
    const expensesTotal = expenses.reduce((s, e) => s + e.amount, 0);

    const expectedCash = session.openingCash + cashSales + cashIn - cashOut - expensesTotal;

    return NextResponse.json({
      ...session,
      visitSummary: {
        cashTotal,
        cardTotal,
        mixedCash,
        visitCount: session.visits.length,
        cashSales,
        cashIn,
        cashOut,
        expensesTotal,
        expectedCash,
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authSession = await requireOwner();
    const body = await req.json();
    const data = openDrawerSchema.parse(body);

    const existing = await prisma.cashDrawerSession.findFirst({
      where: { status: "OPEN" },
    });
    if (existing) {
      return NextResponse.json(
        { error: "A cash session is already open" },
        { status: 409 }
      );
    }

    const session = await prisma.cashDrawerSession.create({
      data: {
        openingCash: data.openingCash,
        notes: data.notes || null,
        openedByUserId: authSession.user.id,
      },
    });

    return NextResponse.json(session, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }
}
