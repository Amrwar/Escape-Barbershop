import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireOwner } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { customerSchema } from "@/lib/validations";
import { getNoShowPolicy } from "@/lib/deposits-server";
import { standing } from "@/lib/no-shows";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const customer = await prisma.customer.findUnique({
      where: { id: params.id },
      include: {
        visits: {
          orderBy: { visitAt: "desc" },
          include: {
            barber: true,
            items: { include: { service: true } },
          },
        },
      },
    });
    if (!customer) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Misses that still count against them, on the shop's own rule.
    const [policy, missed] = await Promise.all([
      getNoShowPolicy(),
      prisma.appointment.findMany({
        where: { customerId: params.id, status: "NO_SHOW" },
        select: { startAt: true },
        orderBy: { startAt: "desc" },
        take: 20,
      }),
    ]);

    return NextResponse.json({
      ...customer,
      noShows: standing(missed, customer.noShowsForgivenAt, Date.now(), policy),
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[customers/GET]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const body = await req.json();
    const parsed = customerSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid data" }, { status: 400 });
    }
    const data = parsed.data;

    const customer = await prisma.customer.update({
      where: { id: params.id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.phone !== undefined && { phone: data.phone || null }),
        ...(data.notes !== undefined && { notes: data.notes || null }),
        ...(data.forgiveNoShows === true && { noShowsForgivenAt: new Date() }),
        ...(data.birthday !== undefined && {
          // Midday, so no timezone can nudge it onto the day before.
          birthday: data.birthday ? new Date(`${data.birthday}T12:00:00Z`) : null,
        }),
      },
    });
    return NextResponse.json(customer);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[customers/PATCH]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authSession = await requireOwner();
    const existing = await prisma.customer.findUnique({ where: { id: params.id } });
    await prisma.customer.delete({ where: { id: params.id } });
    if (existing) {
      await recordAudit(authSession, {
        action: "DELETE",
        entity: "CUSTOMER",
        entityId: existing.id,
        summary: `${existing.name}${existing.phone ? ` · ${existing.phone}` : ""}`,
        details: { notes: existing.notes },
      });
    }
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Prisma FK violation — customer still has visits
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("Foreign key constraint") || msg.includes("P2003") || msg.includes("P2014")) {
      return NextResponse.json({ error: "Cannot delete a customer who has visits" }, { status: 409 });
    }
    console.error("[customers/DELETE]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
