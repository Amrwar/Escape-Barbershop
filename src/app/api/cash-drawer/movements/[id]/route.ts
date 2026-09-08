import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authSession = await requireOwner();

    const movement = await prisma.cashMovement.findUnique({
      where: { id: params.id },
      include: { createdBy: { select: { name: true } } },
    });
    if (!movement) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.cashMovement.delete({ where: { id: params.id } });

    await recordAudit(authSession, {
      action: "DELETE",
      entity: "CASH_MOVEMENT",
      entityId: movement.id,
      amount: movement.amount,
      summary: `${movement.type} ${movement.amount.toFixed(2)} - ${movement.reason}`,
      details: {
        type: movement.type,
        amount: movement.amount,
        reason: movement.reason,
        createdAt: movement.createdAt,
        createdBy: movement.createdBy?.name ?? null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Error" }, { status: 400 });
  }
}
