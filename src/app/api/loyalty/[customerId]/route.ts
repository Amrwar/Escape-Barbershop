import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { getLoyaltySettings, standingFor } from "@/lib/loyalty-server";
import { standingText } from "@/lib/loyalty";
import { recordAudit } from "@/lib/audit";

/**
 * Where a customer stands, for the person at the till — and the record that a
 * reward was handed over.
 *
 * Giving a reward writes a row and nothing else. It does not discount the
 * visit: the cashier charges what the shop decided, and the receipt stays the
 * record of what was actually taken.
 */
export async function GET(_req: NextRequest, { params }: { params: { customerId: string } }) {
  try {
    await requireAuth();
    const settings = await getLoyaltySettings();
    const where = await standingFor(params.customerId, settings);
    return NextResponse.json({ settings, standing: where, text: standingText(where, settings) });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { customerId: string } }) {
  try {
    const authSession = await requireAuth();
    const body = await req.json().catch(() => ({}));

    const settings = await getLoyaltySettings();
    if (!settings.enabled) {
      return NextResponse.json({ error: "Loyalty is switched off" }, { status: 409 });
    }

    const customer = await prisma.customer.findUnique({ where: { id: params.customerId }, select: { id: true, name: true } });
    if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const before = await standingFor(customer.id, settings);
    if (before.available < 1) {
      return NextResponse.json({ error: "This card is not full yet" }, { status: 409 });
    }

    await prisma.loyaltyRedemption.create({
      data: {
        customerId: customer.id,
        visitId: typeof body?.visitId === "string" ? body.visitId : null,
        givenById: authSession.user.id,
        note: typeof body?.note === "string" ? body.note.slice(0, 200) : null,
      },
    });

    await recordAudit(authSession, {
      action: "CREATE",
      entity: "CUSTOMER",
      entityId: customer.id,
      summary: `Loyalty reward given to ${customer.name}: ${settings.rewardText}`,
    });

    const after = await standingFor(customer.id, settings);
    return NextResponse.json({ standing: after, text: standingText(after, settings) }, { status: 201 });
  } catch (err) {
    console.error("[loyalty/redeem]", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
