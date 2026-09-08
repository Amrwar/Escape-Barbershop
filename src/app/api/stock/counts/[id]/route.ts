import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { round2 } from "@/lib/finance";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireOwner();
    const count = await prisma.stockCount.findUnique({
      where: { id: params.id },
      include: { items: { include: { product: { select: { name: true, unit: true } } } } },
    });
    if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      ...count,
      differenceValue: round2(
        count.items.reduce((s, i) => s + (i.countedQty - i.systemQty) * i.unitCost, 0)
      ),
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Deleting a stocktake drops its adjustments, so balances go back to book value.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireOwner();
    await prisma.$transaction(async (tx) => {
      await tx.stockMovement.deleteMany({ where: { refId: params.id, type: "ADJUSTMENT" } });
      await tx.stockCount.delete({ where: { id: params.id } });
    });
    return NextResponse.json({ deleted: true });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
