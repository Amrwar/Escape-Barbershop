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
    const penalty = await prisma.penalty.findUnique({
      where: { id: params.id },
      include: { barber: { select: { name: true } } },
    });
    await prisma.penalty.delete({ where: { id: params.id } });
    if (penalty) {
      await recordAudit(authSession, {
        action: "DELETE",
        entity: "PENALTY",
        entityId: penalty.id,
        amount: penalty.amount,
        summary: `${penalty.amount.toFixed(2)} on ${penalty.barber?.name ?? "—"} - ${penalty.reason}`,
        details: { date: penalty.date },
      });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
