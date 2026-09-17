import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireOwner();
    const { name, unit, costPrice, salePrice, isActive } = await req.json();
    const product = await prisma.product.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name: String(name).trim() }),
        ...(unit !== undefined && { unit: String(unit).trim() }),
        ...(costPrice !== undefined && { costPrice: parseFloat(costPrice) || 0 }),
        // Zero means "not for sale", which is most of the shelf.
        ...(salePrice !== undefined && { salePrice: parseFloat(salePrice) || 0 }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
    });
    return NextResponse.json(product);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (err instanceof Error && err.message.includes("Unique constraint"))
      return NextResponse.json({ error: "name_exists" }, { status: 409 });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

// A product that already moved through the warehouse is deactivated, never
// deleted, so historical invoices and stocktakes stay readable.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authSession = await requireOwner();
    const existing = await prisma.product.findUnique({ where: { id: params.id } });
    const [movements, usages] = await Promise.all([
      prisma.stockMovement.count({ where: { productId: params.id } }),
      prisma.productUsage.count({ where: { productId: params.id } }),
    ]);
    if (movements > 0 || usages > 0) {
      const product = await prisma.product.update({
        where: { id: params.id },
        data: { isActive: false },
      });
      return NextResponse.json({ deactivated: true, product });
    }
    await prisma.product.delete({ where: { id: params.id } });
    if (existing) {
      await recordAudit(authSession, {
        action: "DELETE",
        entity: "PRODUCT",
        entityId: existing.id,
        amount: existing.costPrice,
        summary: `${existing.name} (${existing.unit})`,
      });
    }
    return NextResponse.json({ deleted: true });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
