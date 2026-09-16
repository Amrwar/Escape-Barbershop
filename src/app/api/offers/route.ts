import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireOwner } from "@/lib/auth";
import { offerSchema } from "@/lib/validations";
import { recordAudit } from "@/lib/audit";

/** The shop's offers. The owner writes them; everyone else reads them. */
export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const offers = await prisma.offer.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    });
    return NextResponse.json(offers);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authSession = await requireOwner();
    const data = offerSchema.parse(await req.json());

    const offer = await prisma.offer.create({
      data: {
        title: data.title.trim(),
        titleAr: data.titleAr?.trim() || null,
        description: data.description?.trim() || null,
        price: data.price ?? null,
        wasPrice: data.wasPrice ?? null,
        startsAt: data.startsAt ? new Date(data.startsAt) : null,
        endsAt: data.endsAt ? new Date(data.endsAt) : null,
        isActive: data.isActive ?? true,
      },
    });

    await recordAudit(authSession, {
      action: "CREATE",
      entity: "OFFER",
      entityId: offer.id,
      summary: `Added the offer "${offer.title}"`,
    });

    return NextResponse.json(offer, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }
}
