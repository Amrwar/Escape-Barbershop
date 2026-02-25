import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireOwner } from "@/lib/auth";

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
    });

    return NextResponse.json(expenses);
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
    const body = await req.json();
    const { date, amount, reason } = body;

    if (!date || !amount || !reason) {
      return NextResponse.json({ error: "date, amount, and reason are required" }, { status: 400 });
    }

    const expense = await prisma.expense.create({
      data: {
        date: new Date(date),
        amount: parseFloat(amount),
        reason: String(reason).trim(),
      },
    });

    return NextResponse.json(expense, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to create expense" }, { status: 500 });
  }
}
