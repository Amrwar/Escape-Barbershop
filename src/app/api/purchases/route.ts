import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { purchaseInvoiceSchema } from "@/lib/validations";
import { round2 } from "@/lib/finance";
import { recordAudit } from "@/lib/audit";

// Purchase invoices. Goods always land in the MAIN store.
// CASH / CARD invoices post an Expense on the invoice date so they show up in the
// day journal and the drawer; CREDIT invoices post nothing until the supplier is
// paid (see /api/supplier-payments).
export async function GET(req: NextRequest) {
  try {
    await requireOwner();
    const { searchParams } = req.nextUrl;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const supplierId = searchParams.get("supplierId");

    const invoices = await prisma.purchaseInvoice.findMany({
      where: {
        ...(supplierId ? { supplierId } : {}),
        ...(from || to
          ? { date: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } }
          : {}),
      },
      orderBy: { date: "desc" },
      include: {
        supplier: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true, unit: true } } } },
      },
    });

    const summary = invoices.reduce(
      (acc, i) => {
        acc.total += i.total;
        if (i.paymentType === "CASH") acc.cash += i.total;
        else if (i.paymentType === "CARD") acc.card += i.total;
        else acc.credit += i.total;
        return acc;
      },
      { total: 0, cash: 0, card: 0, credit: 0 }
    );

    return NextResponse.json({ invoices, summary });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[purchases GET]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authSession = await requireOwner();
    const data = purchaseInvoiceSchema.parse(await req.json());
    const date = new Date(data.date);
    const supplierId = data.supplierId ? String(data.supplierId) : null;

    const items = data.items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      unitCost: i.unitCost,
      total: round2(i.quantity * i.unitCost),
    }));
    const total = round2(items.reduce((s, i) => s + i.total, 0));

    const supplier = supplierId
      ? await prisma.supplier.findUnique({ where: { id: supplierId }, select: { name: true } })
      : null;

    const invoice = await prisma.$transaction(async (tx) => {
      // Immediate payment: an expense in the daily journal, paid the same way.
      let expenseId: string | null = null;
      if (data.paymentType !== "CREDIT") {
        const label = [
          "Purchase",
          data.number ? `#${data.number}` : null,
          supplier ? `- ${supplier.name}` : null,
        ]
          .filter(Boolean)
          .join(" ");
        const expense = await tx.expense.create({
          data: {
            date,
            amount: total,
            reason: label,
            paymentMethod: data.paymentType === "CARD" ? "CARD" : "CASH",
            category: "PURCHASE",
          },
        });
        expenseId = expense.id;
      }

      const created = await tx.purchaseInvoice.create({
        data: {
          number: data.number?.trim() || null,
          supplierId,
          date,
          paymentType: data.paymentType,
          total,
          notes: data.notes?.trim() || null,
          expenseId,
          items: { create: items },
        },
        include: { items: true },
      });

      // Stock in, at the main store, plus a cost refresh on each product.
      await tx.stockMovement.createMany({
        data: created.items.map((i) => ({
          productId: i.productId,
          date,
          location: "MAIN" as const,
          type: "PURCHASE" as const,
          quantity: i.quantity,
          unitCost: i.unitCost,
          refId: created.id,
        })),
      });
      for (const i of created.items) {
        await tx.product.update({ where: { id: i.productId }, data: { costPrice: i.unitCost } });
      }

      return created;
    });

    await recordAudit(authSession, {
      action: "CREATE",
      entity: "PURCHASE",
      entityId: invoice.id,
      amount: total,
      summary: `${data.paymentType} ${total.toFixed(2)}${supplier ? ` - ${supplier.name}` : ""}, ${items.length} line(s)`,
    });

    return NextResponse.json(invoice, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[purchases POST]", err);
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }
}
