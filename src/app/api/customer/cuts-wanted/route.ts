import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/auth";

/**
 * "The cut I want": pictures a customer keeps on their own record, so the
 * barber can see what they mean rather than hear it described.
 *
 * Theirs to add and theirs to remove. The shop can see them — that is the
 * entire point — but nobody else's customer can, and nobody at the shop can
 * add one on somebody's behalf.
 */

/** Enough to show a barber. More than this is a mood board, not an instruction. */
const MAX_PHOTOS = 6;

export async function GET() {
  try {
    const session = await requireCustomer();
    const photos = await prisma.cutWanted.findMany({
      where: { customerId: session.user.customerId },
      orderBy: { createdAt: "desc" },
      select: { id: true, image: true, note: true, createdAt: true },
    });
    return NextResponse.json(photos);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireCustomer();
    const body = await req.json();

    const image = String(body?.image ?? "");
    if (!image.startsWith("data:image/")) {
      return NextResponse.json({ error: "That does not look like a picture" }, { status: 400 });
    }
    if (image.length > 400_000) {
      return NextResponse.json({ error: "That picture is too big — try another" }, { status: 400 });
    }

    const already = await prisma.cutWanted.count({ where: { customerId: session.user.customerId } });
    if (already >= MAX_PHOTOS) {
      return NextResponse.json({ error: `You can keep ${MAX_PHOTOS} — remove one first` }, { status: 409 });
    }

    const photo = await prisma.cutWanted.create({
      data: {
        customerId: session.user.customerId,
        image,
        note: typeof body?.note === "string" ? body.note.trim().slice(0, 200) || null : null,
      },
      select: { id: true, note: true, createdAt: true },
    });

    return NextResponse.json(photo, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[customer/cuts-wanted]", err);
    return NextResponse.json({ error: "Could not add that" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireCustomer();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Which one?" }, { status: 400 });

    // Scoped to the customer signed in: nobody removes anybody else's.
    const gone = await prisma.cutWanted.deleteMany({ where: { id, customerId: session.user.customerId } });
    if (gone.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
