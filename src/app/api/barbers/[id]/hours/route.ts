import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireOwner } from "@/lib/auth";
import { barberHoursSchema } from "@/lib/validations";
import { recordAudit } from "@/lib/audit";

/**
 * One barber's own week.
 *
 * `BarberWorkingHours` has been in the schema from the start, and both the slot
 * maths (`workingWindow`) and the roster read it — but nothing anywhere could
 * write a row, so every barber has silently worked the shop's full day. With
 * online booking on, that means a customer can book anyone at any hour the shop
 * is open, whether or not that barber is ever there.
 *
 * A row here only ever *narrows* the shop's day. No row at all keeps the old
 * behaviour, so nothing changes for a shop that has not set any.
 */

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Anyone on the staff may read a rota; only the owner may change one.
    await requireAuth();
    const rows = await prisma.barberWorkingHours.findMany({
      where: { barberId: params.id },
      orderBy: { weekday: "asc" },
      select: { weekday: true, startMinute: true, endMinute: true, isWorking: true },
    });
    return NextResponse.json({ hours: rows });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireOwner();
    const { hours } = barberHoursSchema.parse(await req.json());

    const barber = await prisma.barber.findUnique({ where: { id: params.id }, select: { id: true, name: true } });
    if (!barber) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // The whole week in one transaction: a rota half-applied is worse than one
    // never applied, because the gap is invisible until somebody books into it.
    await prisma.$transaction([
      prisma.barberWorkingHours.deleteMany({ where: { barberId: params.id } }),
      ...hours.map((day) =>
        prisma.barberWorkingHours.create({
          data: {
            barberId: params.id,
            weekday: day.weekday,
            startMinute: day.startMinute,
            endMinute: day.endMinute,
            isWorking: day.isWorking ?? true,
          },
        })
      ),
    ]);

    const working = hours.filter((d) => d.isWorking !== false).length;
    await recordAudit(session, {
      action: "UPDATE",
      entity: "BARBER",
      entityId: barber.id,
      summary: `Set ${barber.name}'s hours: ${working} of 7 days`,
    });

    return NextResponse.json({ ok: true, days: hours.length });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err && typeof err === "object" && "issues" in err) {
      return NextResponse.json({ error: "Those hours do not make sense" }, { status: 400 });
    }
    console.error("[barbers/hours]", err);
    return NextResponse.json({ error: "Could not save those" }, { status: 400 });
  }
}

/** Clearing the rota puts them back on the shop's own hours. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireOwner();
    await prisma.barberWorkingHours.deleteMany({ where: { barberId: params.id } });
    await recordAudit(session, {
      action: "UPDATE",
      entity: "BARBER",
      entityId: params.id,
      summary: "Cleared their own hours — back on the shop's",
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
