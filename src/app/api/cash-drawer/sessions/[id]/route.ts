import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authSession = await requireOwner();

    const { pin } = await req.json();
    const setting = await prisma.setting.findUnique({ where: { key: "edit_pin" } });
    if (!setting || setting.value !== String(pin ?? "")) {
      return NextResponse.json({ error: "Incorrect PIN" }, { status: 403 });
    }

    const session = await prisma.cashDrawerSession.findUnique({
      where: { id: params.id },
    });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Unlink visits from session before deleting
    await prisma.visit.updateMany({
      where: { sessionId: params.id },
      data: { sessionId: null },
    });

    // Movements are cascade-deleted via Prisma relation
    await prisma.cashMovement.deleteMany({ where: { sessionId: params.id } });
    await prisma.cashDrawerSession.delete({ where: { id: params.id } });

    await recordAudit(authSession, {
      action: "DELETE",
      entity: "DRAWER_SESSION",
      entityId: params.id,
      amount: session.closingCashCounted,
      summary: `Deleted the drawer session opened ${session.openedAt.toISOString()}`,
      details: {
        openedAt: session.openedAt,
        closedAt: session.closedAt,
        openingCash: session.openingCash,
        closingCashCounted: session.closingCashCounted,
      },
    });

    return NextResponse.json({ deleted: true });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
  }
}
