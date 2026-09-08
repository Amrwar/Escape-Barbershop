import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireOwner();
    const invoice = await prisma.purchaseInvoice.findUnique({
      where: { id: params.id },
      include: {
        supplier: { select: { id: true, name: true, phone: true } },
        items: { include: { product: { select: { name: true, unit: true } } } },
        expense: true,
      },
    });
    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(invoice);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Deleting an invoice reverses everything it created: the stock it added, and
// the expense it posted to the journal.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireOwner();
    const invoice = await prisma.purchaseInvoice.findUnique({
      where: { id: params.id },
      select: { id: true, expenseId: true },
    });
    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.$transaction(async (tx) => {
      await tx.stockMovement.deleteMany({ where: { refId: invoice.id, type: "PURCHASE" } });
      await tx.purchaseInvoice.delete({ where: { id: invoice.id } });
      if (invoice.expenseId) {
        await tx.expense.delete({ where: { id: invoice.expenseId } });
      }
    });

    return NextResponse.json({ deleted: true });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[purchases DELETE]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
