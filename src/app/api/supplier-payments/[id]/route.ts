import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireOwner();
    const payment = await prisma.supplierPayment.findUnique({
      where: { id: params.id },
      select: { id: true, expenseId: true },
    });
    if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.$transaction(async (tx) => {
      await tx.supplierPayment.delete({ where: { id: payment.id } });
      if (payment.expenseId) await tx.expense.delete({ where: { id: payment.expenseId } });
    });
    return NextResponse.json({ deleted: true });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
