import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { supplierSchema } from "@/lib/validations";

// Supplier accounts: opening balance is always zero — the balance is the sum of
// unpaid (CREDIT) invoices minus the payments made against the account.
export async function GET(req: NextRequest) {
  try {
    await requireOwner();
    const includeInactive = req.nextUrl.searchParams.get("includeInactive") === "1";

    const suppliers = await prisma.supplier.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: "asc" },
      include: {
        invoices: { select: { total: true, paymentType: true } },
        payments: { select: { amount: true } },
      },
    });

    return NextResponse.json(
      suppliers.map((s) => {
        const credit = s.invoices
          .filter((i) => i.paymentType === "CREDIT")
          .reduce((sum, i) => sum + i.total, 0);
        const paid = s.payments.reduce((sum, p) => sum + p.amount, 0);
        return {
          id: s.id,
          name: s.name,
          phone: s.phone,
          notes: s.notes,
          isActive: s.isActive,
          invoiceCount: s.invoices.length,
          creditTotal: credit,
          paidTotal: paid,
          balance: credit - paid,
        };
      })
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[suppliers GET]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireOwner();
    const data = supplierSchema.parse(await req.json());
    const supplier = await prisma.supplier.create({
      data: {
        name: data.name.trim(),
        phone: data.phone?.trim() || null,
        notes: data.notes?.trim() || null,
      },
    });
    return NextResponse.json(supplier, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (err instanceof Error && err.message.includes("Unique constraint"))
      return NextResponse.json({ error: "name_exists" }, { status: 409 });
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }
}
