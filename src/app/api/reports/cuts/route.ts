import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner, requireShopPerson } from "@/lib/auth";

/**
 * Reports on a cut: what happened, written by whoever was there.
 *
 * A cut reaches the shop two ways — booked, which is an appointment, or walked
 * in, which is a visit — and by far the most of them walk in. A report hangs off
 * whichever one it was, so the barber's day screen and the till can both file
 * one about the same kind of thing.
 *
 * Anyone on the staff may write one. Reading the whole shop's is the owner's,
 * because a complaint about one barber is not another barber's business; a
 * barber can still read back the ones they wrote themselves.
 */

const KINDS = ["NOTE", "COMPLAINT", "EQUIPMENT", "INCIDENT"] as const;

/** Enough to identify the cut on the owner's screen, from either side. */
const CUT = {
  appointment: {
    select: {
      id: true,
      startAt: true,
      customer: { select: { id: true, name: true } },
      barber: { select: { name: true } },
    },
  },
  visit: {
    select: {
      id: true,
      visitAt: true,
      customer: { select: { id: true, name: true } },
      barber: { select: { name: true } },
    },
  },
};

export async function GET(req: NextRequest) {
  try {
    const session = await requireShopPerson();
    const mine = req.nextUrl.searchParams.get("mine") === "1";
    const unseen = req.nextUrl.searchParams.get("unseen") === "1";

    // Anyone may read back their own; only the owner reads the whole shop's.
    if (!mine && session.user.role !== "OWNER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const reports = await prisma.cutReport.findMany({
      where: {
        ...(mine ? { authorId: session.user.id } : {}),
        ...(unseen ? { seenAt: null } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        kind: true,
        body: true,
        authorName: true,
        seenAt: true,
        createdAt: true,
        ...CUT,
      },
    });

    return NextResponse.json(reports);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireShopPerson();
    const body = await req.json();

    const appointmentId = typeof body?.appointmentId === "string" ? body.appointmentId : null;
    const visitId = typeof body?.visitId === "string" ? body.visitId : null;
    const text = String(body?.body ?? "").trim();
    const kind = KINDS.includes(body?.kind) ? body.kind : "NOTE";

    if (!text) return NextResponse.json({ error: "Write what happened" }, { status: 400 });
    if (!appointmentId === !visitId) {
      // Neither, or both — either way we do not know what this is about.
      return NextResponse.json({ error: "Which cut?" }, { status: 400 });
    }

    // Whose cut it was, asked the same way of both kinds.
    const cut = appointmentId
      ? await prisma.appointment.findUnique({ where: { id: appointmentId }, select: { id: true, barberId: true } })
      : await prisma.visit.findUnique({ where: { id: visitId! }, select: { id: true, barberId: true } });
    if (!cut) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // A barber may only report on their own chair; the shop may report on any.
    if (session.user.role === "BARBER" && cut.barberId !== session.user.barberId) {
      return NextResponse.json({ error: "That was not your cut" }, { status: 403 });
    }

    const report = await prisma.cutReport.create({
      data: {
        appointmentId,
        visitId,
        authorId: session.user.id,
        authorName: session.user.name ?? "—",
        kind,
        body: text.slice(0, 1000),
      },
      select: { id: true, kind: true, body: true, createdAt: true },
    });

    return NextResponse.json(report, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[reports/cuts]", err);
    return NextResponse.json({ error: "Could not file that" }, { status: 400 });
  }
}

/** The owner marking a report read, so a shift can be worked through. */
export async function PATCH(req: NextRequest) {
  try {
    await requireOwner();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Which one?" }, { status: 400 });

    const done = await prisma.cutReport.updateMany({
      where: { id, seenAt: null },
      data: { seenAt: new Date() },
    });
    if (done.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
