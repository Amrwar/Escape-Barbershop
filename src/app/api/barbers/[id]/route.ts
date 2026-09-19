import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { barberSchema } from "@/lib/validations";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authSession = await requireOwner();
    const existing = await prisma.barber.findUnique({ where: { id: params.id } });
    // Unlink visits from barber before deleting
    await prisma.visit.updateMany({ where: { barberId: params.id }, data: { barberId: null } });
    await prisma.barberSalarySettings.deleteMany({ where: { barberId: params.id } });
    await prisma.barber.delete({ where: { id: params.id } });
    if (existing) {
      await recordAudit(authSession, {
        action: "DELETE",
        entity: "BARBER",
        entityId: existing.id,
        summary: `${existing.name}${existing.phone ? ` · ${existing.phone}` : ""}`,
        details: { isActive: existing.isActive },
      });
    }
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireOwner();
    const body = await req.json();
    const data = barberSchema.partial().parse(body);

    const barber = await prisma.barber.update({
      where: { id: params.id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.phone !== undefined && { phone: data.phone || null }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.bookableOnline !== undefined && { bookableOnline: data.bookableOnline }),
        ...(data.bio !== undefined && { bio: data.bio || null }),
        // An empty string is "take it down", which is different from not saying.
        ...(data.photo !== undefined && { photo: data.photo || null }),
      },
      include: { salarySettings: true },
    });
    return NextResponse.json(barber);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }
}
