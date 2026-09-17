import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { standingFor } from "@/lib/referrals-server";
import { referralText } from "@/lib/referrals";
import { getReferralSettings } from "@/lib/loyalty-server";
import { recordAudit } from "@/lib/audit";

/**
 * What a customer is owed for the friends they brought in, and the record that
 * the shop handed one over.
 *
 * As with the loyalty card, giving a reward writes a row and moves no money:
 * the cashier charges what the shop decides and the receipt stays the record.
 */
export async function GET(_req: NextRequest, { params }: { params: { customerId: string } }) {
  try {
    await requireAuth();
    const settings = await getReferralSettings();
    const standing = await standingFor(params.customerId);

    return NextResponse.json({
      settings,
      standing,
      text: settings.enabled ? referralText(standing, settings.rewardText) : null,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { customerId: string } }) {
  try {
    const authSession = await requireAuth();
    const settings = await getReferralSettings();
    if (!settings.enabled) {
      return NextResponse.json({ error: "Referrals are switched off" }, { status: 409 });
    }

    const customer = await prisma.customer.findUnique({
      where: { id: params.customerId },
      select: { id: true, name: true },
    });
    if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const standing = await standingFor(customer.id);
    if (standing.waiting < 1) {
      return NextResponse.json({ error: "Nothing is owed for referrals yet" }, { status: 409 });
    }

    // The oldest unrewarded referral whose friend has actually been in.
    const candidates = await prisma.referral.findMany({
      where: { referrerId: customer.id, rewardGivenAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, referredId: true, referred: { select: { name: true } } },
    });
    const visited = await prisma.visit.groupBy({
      by: ["customerId"],
      where: { customerId: { in: candidates.map((c) => c.referredId) } },
      _count: { _all: true },
    });
    const beenIn = new Set(visited.filter((v) => v._count._all > 0).map((v) => v.customerId));
    const referral = candidates.find((c) => beenIn.has(c.referredId));
    if (!referral) {
      return NextResponse.json({ error: "Nothing is owed for referrals yet" }, { status: 409 });
    }

    await prisma.referral.update({
      where: { id: referral.id },
      data: { rewardGivenAt: new Date(), rewardGivenById: authSession.user.id },
    });

    await recordAudit(authSession, {
      action: "UPDATE",
      entity: "CUSTOMER",
      entityId: customer.id,
      summary: `Referral reward given to ${customer.name} for bringing in ${referral.referred.name}: ${settings.rewardText}`,
    });

    const after = await standingFor(customer.id);
    return NextResponse.json({ standing: after, text: referralText(after, settings.rewardText) }, { status: 201 });
  } catch (err) {
    console.error("[referrals/reward]", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
