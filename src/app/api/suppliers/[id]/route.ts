import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

// Supplier account statement: invoices and payments merged into one ledger.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireOwner();
    const supplier = await prisma.supplier.findUnique({
      where: { id: params.id },
      include: {
        invoices: {
          orderBy: { date: "desc" },
          include: { items: { include: { product: { select: { name: true, unit: true } } } } },
        },
        payments: { orderBy: { date: "desc" } },
      },
    });
    if (!supplier) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const credit = supplier.invoices
      .filter((i) => i.paymentType === "CREDIT")
      .reduce((s, i) => s + i.total, 0);
    const paid = supplier.payments.reduce((s, p) => s + p.amount, 0);

    return NextResponse.json({
      ...supplier,
      creditTotal: credit,
      paidTotal: paid,
      balance: credit - paid,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireOwner();
    const { name, phone, notes, isActive } = await req.json();
    const supplier = await prisma.supplier.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name: String(name).trim() }),
        ...(phone !== undefined && { phone: String(phone).trim() || null }),
        ...(notes !== undefined && { notes: String(notes).trim() || null }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
    });
    return NextResponse.json(supplier);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (err instanceof Error && err.message.includes("Unique constraint"))
      return NextResponse.json({ error: "name_exists" }, { status: 409 });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authSession = await requireOwner();
    const existing = await prisma.supplier.findUnique({ where: { id: params.id } });
    const [invoices, payments] = await Promise.all([
      prisma.purchaseInvoice.count({ where: { supplierId: params.id } }),
      prisma.supplierPayment.count({ where: { supplierId: params.id } }),
    ]);
    if (invoices > 0 || payments > 0) {
      const supplier = await prisma.supplier.update({
        where: { id: params.id },
        data: { isActive: false },
      });
      return NextResponse.json({ deactivated: true, supplier });
    }
    await prisma.supplier.delete({ where: { id: params.id } });
    if (existing) {
      await recordAudit(authSession, {
        action: "DELETE",
        entity: "SUPPLIER",
        entityId: existing.id,
        summary: `${existing.name}${existing.phone ? ` · ${existing.phone}` : ""}`,
      });
    }
    return NextResponse.json({ deleted: true });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
