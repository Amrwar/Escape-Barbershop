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

    const advance = await prisma.advance.findUnique({
      where: { id: params.id },
      include: { barber: { select: { name: true } } },
    });
    if (!advance) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.advance.delete({ where: { id: params.id } });

    await recordAudit(authSession, {
      action: "DELETE",
      entity: "ADVANCE",
      entityId: advance.id,
      amount: advance.amount,
      summary: `${advance.amount.toFixed(2)} ${advance.paymentMethod} to ${advance.barber?.name ?? "—"}`,
      details: { date: advance.date, notes: advance.notes },
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to delete advance" }, { status: 400 });
  }
}
