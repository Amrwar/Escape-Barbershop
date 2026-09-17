import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBarber } from "@/lib/auth";

/**
 * A barber's own portfolio: work they are proud of, on their public profile.
 *
 * Theirs to add and theirs to remove — nobody else's, in either direction. The
 * shop can hide a barber from the app entirely, which takes the photos with
 * them; short of that, what a barber shows of their own work is their business.
 */

/** How many a barber may show. A wall of forty is not a portfolio. */
const MAX_PHOTOS = 12;

export async function GET() {
  try {
    const session = await requireBarber();
    const photos = await prisma.barberPhoto.findMany({
      where: { barberId: session.user.barberId },
      orderBy: [{ position: "asc" }, { createdAt: "desc" }],
      select: { id: true, image: true, caption: true, position: true },
    });
    return NextResponse.json(photos);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireBarber();
    const body = await req.json();

    const image = String(body?.image ?? "");
    if (!image.startsWith("data:image/")) {
      return NextResponse.json({ error: "That does not look like a picture" }, { status: 400 });
    }
    if (image.length > 400_000) {
      return NextResponse.json({ error: "That picture is too big — try another" }, { status: 400 });
    }

    const already = await prisma.barberPhoto.count({ where: { barberId: session.user.barberId } });
    if (already >= MAX_PHOTOS) {
      return NextResponse.json({ error: `You can show ${MAX_PHOTOS} photos — remove one first` }, { status: 409 });
    }

    const photo = await prisma.barberPhoto.create({
      data: {
        barberId: session.user.barberId,
        image,
        caption: typeof body?.caption === "string" ? body.caption.trim().slice(0, 100) || null : null,
        position: already,
      },
      select: { id: true, caption: true, position: true },
    });

    return NextResponse.json(photo, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[barber/photos]", err);
    return NextResponse.json({ error: "Could not add that" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireBarber();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Which one?" }, { status: 400 });

    // Scoped to the barber signed in: nobody removes anybody else's work.
    const gone = await prisma.barberPhoto.deleteMany({ where: { id, barberId: session.user.barberId } });
    if (gone.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
