import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authSession = await requireAuth();

    const expense = await prisma.expense.findUnique({
      where: { id: params.id },
      include: { purchaseInvoice: { select: { id: true } }, supplierPayment: { select: { id: true } } },
    });
    if (!expense) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (expense.purchaseInvoice) {
      return NextResponse.json({ error: "linked_to_purchase" }, { status: 409 });
    }
    if (expense.supplierPayment) {
      return NextResponse.json({ error: "linked_to_supplier_payment" }, { status: 409 });
    }

    await prisma.expense.delete({ where: { id: params.id } });

    await recordAudit(authSession, {
      action: "DELETE",
      entity: "EXPENSE",
      entityId: expense.id,
      amount: expense.amount,
      summary: `${expense.amount.toFixed(2)} ${expense.paymentMethod} - ${expense.reason}`,
      details: { date: expense.date, category: expense.category },
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to delete expense" }, { status: 400 });
  }
}
