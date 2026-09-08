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
    const existing = await prisma.productUsage.findUnique({
      where: { id: params.id },
      include: { product: { select: { name: true, unit: true } } },
    });
    await prisma.$transaction(async (tx) => {
      await tx.stockMovement.deleteMany({ where: { refId: params.id, type: "USAGE" } });
      await tx.productUsage.delete({ where: { id: params.id } });
    });
    if (existing) {
      await recordAudit(authSession, {
        action: "DELETE",
        entity: "PRODUCT_USAGE",
        entityId: existing.id,
        summary: `${existing.product?.name ?? "—"} ${existing.quantity} ${existing.product?.unit ?? ""}`,
        details: { date: existing.date, location: existing.location, notes: existing.notes },
      });
    }
    return NextResponse.json({ deleted: true });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
