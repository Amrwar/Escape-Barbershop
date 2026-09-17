import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBarber } from "@/lib/auth";

/**
 * A barber asking for a day off.
 *
 * Asking blocks nothing: the diary keeps taking bookings until somebody
 * answers, because a barber who could empty their own week by asking would be
 * a diary the shop cannot trust. What it does do is put the request in front of
 * the owner instead of arriving as a phone call on a day off.
 */
export async function GET() {
  try {
    const session = await requireBarber();

    const requests = await prisma.barberTimeOff.findMany({
      where: { barberId: session.user.barberId, endAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
      orderBy: { startAt: "asc" },
      select: { id: true, startAt: true, endAt: true, reason: true, status: true, decidedAt: true },
    });

    return NextResponse.json(requests);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireBarber();
    const body = await req.json();

    const startAt = new Date(String(body?.startAt ?? ""));
    const endAt = new Date(String(body?.endAt ?? ""));
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      return NextResponse.json({ error: "Please choose when" }, { status: 400 });
    }
    if (endAt <= startAt) {
      return NextResponse.json({ error: "The end has to come after the start" }, { status: 400 });
    }
    if (endAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "That time has already passed" }, { status: 400 });
    }

    // Asking twice for the same days helps nobody.
    const already = await prisma.barberTimeOff.findFirst({
      where: {
        barberId: session.user.barberId,
        status: { in: ["REQUESTED", "APPROVED"] },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { id: true, status: true },
    });
    if (already) {
      return NextResponse.json(
        { error: already.status === "APPROVED" ? "You already have that time off" : "You have already asked for that" },
        { status: 409 }
      );
    }

    const request = await prisma.barberTimeOff.create({
      data: {
        barberId: session.user.barberId,
        startAt,
        endAt,
        reason: typeof body?.reason === "string" ? body.reason.trim().slice(0, 200) || null : null,
        status: "REQUESTED",
      },
      select: { id: true, startAt: true, endAt: true, status: true },
    });

    return NextResponse.json(request, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[barber/time-off]", err);
    return NextResponse.json({ error: "Could not ask for that" }, { status: 400 });
  }
}

/** Taking back a request nobody has answered yet. */
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireBarber();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Which one?" }, { status: 400 });

    const gone = await prisma.barberTimeOff.deleteMany({
      where: { id, barberId: session.user.barberId, status: "REQUESTED" },
    });
    if (gone.count === 0) {
      return NextResponse.json({ error: "That has already been answered" }, { status: 409 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
