import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { supplierPaymentSchema } from "@/lib/validations";

// Paying down a supplier account. The money leaves the business now, so this is
// the moment a CREDIT purchase finally hits the daily journal as an expense.
export async function GET(req: NextRequest) {
  try {
    await requireOwner();
    const { searchParams } = req.nextUrl;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const supplierId = searchParams.get("supplierId");

    const payments = await prisma.supplierPayment.findMany({
      where: {
        ...(supplierId ? { supplierId } : {}),
        ...(from || to
          ? { date: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } }
          : {}),
      },
      orderBy: { date: "desc" },
      include: { supplier: { select: { id: true, name: true } } },
    });
    return NextResponse.json(payments);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireOwner();
    const data = supplierPaymentSchema.parse(await req.json());
    const date = new Date(data.date);

    const supplier = await prisma.supplier.findUnique({
      where: { id: data.supplierId },
      select: { name: true },
    });
    if (!supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

    const payment = await prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          date,
          amount: data.amount,
          reason: `Supplier payment - ${supplier.name}`,
          paymentMethod: data.paymentMethod,
          category: "SUPPLIER_PAYMENT",
        },
      });
      return tx.supplierPayment.create({
        data: {
          supplierId: data.supplierId,
          date,
          amount: data.amount,
          paymentMethod: data.paymentMethod,
          notes: data.notes?.trim() || null,
          expenseId: expense.id,
        },
        include: { supplier: { select: { id: true, name: true } } },
      });
    });

    return NextResponse.json(payment, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[supplier-payments POST]", err);
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }
}
