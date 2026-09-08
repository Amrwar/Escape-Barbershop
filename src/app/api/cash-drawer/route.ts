import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireOwnerOrCashier } from "@/lib/auth";
import { openDrawerSchema } from "@/lib/validations";
import { recordAudit } from "@/lib/audit";
import { getJournalOutflows, getVisaCommissionPercent, visaCommissionOn, round2 } from "@/lib/finance";

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
            tip: true,
            paymentMethod: true,
          },
        },
      },
    });

    if (!session) return NextResponse.json(null);

    // Cash tips (CASH/MIXED) flow directly into the drawer; card tips are auto-deducted as CashMovement OUT
    const cashTotal = session.visits
      .filter((v) => v.paymentMethod === "CASH")
      .reduce((s, v) => s + (v.cashAmount ?? v.total) + (v.tip ?? 0), 0);

    const cardTotal = session.visits
      .filter((v) => v.paymentMethod === "CARD")
      .reduce((s, v) => s + (v.cardAmount ?? v.total), 0);

    const mixedCash = session.visits
      .filter((v) => v.paymentMethod === "MIXED")
      .reduce((s, v) => s + (v.cashAmount ?? 0) + (v.tip ?? 0), 0);

    const mixedCard = session.visits
      .filter((v) => v.paymentMethod === "MIXED")
      .reduce((s, v) => s + (v.cardAmount ?? 0), 0);

    const cashSales = cashTotal + mixedCash;
    const cardSales = cardTotal + mixedCard;

    const cashIn = session.movements
      .filter((m) => m.type === "IN")
      .reduce((s, m) => s + m.amount, 0);

    const cashOut = session.movements
      .filter((m) => m.type === "OUT")
      .reduce((s, m) => s + m.amount, 0);

    // Expenses and advances logged during this session's time window.
    // Only the ones paid in cash can move the drawer; card ones settle on the card account.
    const outflows = await getJournalOutflows(session.openedAt, new Date());

    const visaPercent = await getVisaCommissionPercent();
    const visaCommission = visaCommissionOn(cardSales, visaPercent);
    const cardNet = round2(cardSales - visaCommission - outflows.cardExpenses - outflows.cardAdvances);

    const expectedCash = round2(
      session.openingCash +
        cashSales +
        cashIn -
        cashOut -
        outflows.cashExpenses -
        outflows.cashAdvances
    );

    return NextResponse.json({
      ...session,
      visitSummary: {
        cashTotal,
        cardTotal,
        mixedCash,
        mixedCard,
        visitCount: session.visits.length,
        cashSales,
        cardSales,
        cashIn,
        cashOut,
        // `expensesTotal` stays the all-in figure for existing callers
        expensesTotal: outflows.expensesTotal,
        cashExpenses: outflows.cashExpenses,
        cardExpenses: outflows.cardExpenses,
        advancesTotal: outflows.advancesTotal,
        cashAdvances: outflows.cashAdvances,
        cardAdvances: outflows.cardAdvances,
        visaPercent,
        visaCommission,
        cardNet,
        expectedCash,
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authSession = await requireOwnerOrCashier();
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

    await recordAudit(authSession, {
      action: "CREATE",
      entity: "DRAWER_SESSION",
      entityId: session.id,
      amount: data.openingCash,
      summary: `Opened the drawer with ${data.openingCash.toFixed(2)}`,
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
