import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { offerSchema } from "@/lib/validations";
import { recordAudit } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authSession = await requireOwner();
    const data = offerSchema.partial().parse(await req.json());

    const offer = await prisma.offer.update({
      where: { id: params.id },
      data: {
        ...(data.title !== undefined && { title: data.title.trim() }),
        ...(data.titleAr !== undefined && { titleAr: data.titleAr?.trim() || null }),
        ...(data.description !== undefined && { description: data.description?.trim() || null }),
        ...(data.price !== undefined && { price: data.price ?? null }),
        ...(data.wasPrice !== undefined && { wasPrice: data.wasPrice ?? null }),
        ...(data.startsAt !== undefined && { startsAt: data.startsAt ? new Date(data.startsAt) : null }),
        ...(data.endsAt !== undefined && { endsAt: data.endsAt ? new Date(data.endsAt) : null }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });

    await recordAudit(authSession, {
      action: "UPDATE",
      entity: "OFFER",
      entityId: offer.id,
      summary: `Changed the offer "${offer.title}"`,
    });

    return NextResponse.json(offer);
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof Error && err.message.includes("Record to update not found")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authSession = await requireOwner();
    const offer = await prisma.offer.findUnique({ where: { id: params.id } });
    if (!offer) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.offer.delete({ where: { id: params.id } });
    await recordAudit(authSession, {
      action: "DELETE",
      entity: "OFFER",
      entityId: offer.id,
      summary: `Removed the offer "${offer.title}"`,
      details: offer,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Could not remove that offer" }, { status: 400 });
  }
}
