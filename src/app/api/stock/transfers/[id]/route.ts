import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireOwner();
    const transfer = await prisma.stockTransfer.findUnique({
      where: { id: params.id },
      include: { items: { include: { product: { select: { name: true, unit: true } } } } },
    });
    if (!transfer) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(transfer);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Owner-only: reversing an issue note moves stock back, so it is not something
// the cashier undoes after the fact.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authSession = await requireOwner();

    const existing = await prisma.stockTransfer.findUnique({
      where: { id: params.id },
      include: { items: { include: { product: { select: { name: true } } } } },
    });

    await prisma.$transaction(async (tx) => {
      await tx.stockMovement.deleteMany({
        where: { refId: params.id, type: { in: ["TRANSFER_IN", "TRANSFER_OUT"] } },
      });
      await tx.stockTransfer.delete({ where: { id: params.id } });
    });
    await recordAudit(authSession, {
      action: "DELETE",
      entity: "STOCK_TRANSFER",
      entityId: params.id,
      summary: `Issue note ${existing?.number ?? params.id.slice(-6)} with ${
        existing?.items.length ?? 0
      } product(s)`,
      details: existing?.items.map((i) => ({ product: i.product?.name, quantity: i.quantity })),
    });

    return NextResponse.json({ deleted: true });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
