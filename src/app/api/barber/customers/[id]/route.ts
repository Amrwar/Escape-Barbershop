import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBarber } from "@/lib/auth";
import { customerNoteSchema } from "@/lib/validations";

/**
 * What the barber should know before the customer sits down: how often they
 * come, what they usually have, and the notes left last time ("low fade").
 *
 * A barber may only open a customer they have actually served or are about to —
 * this is not a directory of the shop's customers to browse.
 */
async function assertServed(barberId: string, customerId: string) {
  const [seen, booked] = await Promise.all([
    prisma.visit.findFirst({ where: { barberId, customerId }, select: { id: true } }),
    prisma.appointment.findFirst({ where: { barberId, customerId }, select: { id: true } }),
  ]);
  return !!seen || !!booked;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireBarber();
    const barberId = session.user.barberId;
    if (!(await assertServed(barberId, params.id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [customer, visits, notes, upcoming] = await Promise.all([
      prisma.customer.findUnique({ where: { id: params.id }, select: { id: true, name: true, phone: true } }),
      prisma.visit.findMany({
        where: { customerId: params.id, barberId },
        orderBy: { visitAt: "desc" },
        take: 20,
        select: {
          id: true,
          visitAt: true,
          total: true,
          items: { select: { quantity: true, service: { select: { name: true, arabicName: true } } } },
        },
      }),
      prisma.customerNote.findMany({
        where: { customerId: params.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, text: true, createdAt: true, barber: { select: { name: true } } },
      }),
      prisma.appointment.findMany({
        where: { customerId: params.id, barberId, startAt: { gte: new Date() }, status: { in: ["CONFIRMED", "CHECKED_IN"] } },
        orderBy: { startAt: "asc" },
        select: { id: true, startAt: true, services: { select: { serviceName: true } } },
      }),
    ]);
    if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // What they usually ask for, commonest first.
    const counts = new Map<string, number>();
    for (const v of visits) {
      for (const i of v.items) {
        const name = i.service?.name ?? "—";
        counts.set(name, (counts.get(name) ?? 0) + i.quantity);
      }
    }

    return NextResponse.json({
      customer,
      visitCount: visits.length,
      lastVisit: visits[0]?.visitAt ?? null,
      totalSpent: visits.reduce((s, v) => s + v.total, 0),
      usual: Array.from(counts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 4),
      visits,
      notes,
      upcoming,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/** Leave a note for next time. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireBarber();
    const barberId = session.user.barberId;
    if (!(await assertServed(barberId, params.id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data = customerNoteSchema.parse(await req.json());
    const note = await prisma.customerNote.create({
      data: {
        customerId: params.id,
        barberId,
        createdByUserId: session.user.id,
        text: data.text.trim(),
      },
      select: { id: true, text: true, createdAt: true, barber: { select: { name: true } } },
    });

    return NextResponse.json(note, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Could not save that note" }, { status: 400 });
  }
}
