import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { expenseSchema } from "@/lib/validations";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = req.nextUrl;
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const expenses = await prisma.expense.findMany({
      where: {
        ...(from || to
          ? {
              date: {
                ...(from && { gte: new Date(from) }),
                ...(to && { lte: new Date(to) }),
              },
            }
          : {}),
      },
      orderBy: { date: "desc" },
      include: {
        purchaseInvoice: { select: { id: true, number: true } },
        supplierPayment: { select: { id: true } },
      },
    });

    return NextResponse.json(
      expenses.map((e) => ({
        id: e.id,
        date: e.date,
        amount: e.amount,
        reason: e.reason,
        paymentMethod: e.paymentMethod,
        category: e.category,
        // Expenses posted automatically by a purchase or a supplier payment are
        // edited from the warehouse screens, not here.
        locked: Boolean(e.purchaseInvoice || e.supplierPayment),
      }))
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[expenses GET]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    const data = expenseSchema.parse(await req.json());

    const expense = await prisma.expense.create({
      data: {
        date: new Date(data.date),
        amount: data.amount,
        reason: data.reason.trim(),
        paymentMethod: data.paymentMethod,
        category: data.category?.trim() || null,
      },
    });

    return NextResponse.json(expense, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to create expense" }, { status: 400 });
  }
}
