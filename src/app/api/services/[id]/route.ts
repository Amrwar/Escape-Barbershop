import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { serviceSchema } from "@/lib/validations";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireOwner();
    const body = await req.json();
    const data = serviceSchema.partial().parse(body);

    const service = await prisma.service.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json(service);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authSession = await requireOwner();
    const existing = await prisma.service.findUnique({ where: { id: params.id } });
    await prisma.service.delete({ where: { id: params.id } });
    if (existing) {
      await recordAudit(authSession, {
        action: "DELETE",
        entity: "SERVICE",
        entityId: existing.id,
        amount: existing.defaultPrice,
        summary: `${existing.name} (${existing.defaultPrice.toFixed(2)})`,
        details: { arabicName: existing.arabicName, excludeFromCommission: existing.excludeFromCommission },
      });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
