import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireOwner } from "@/lib/auth";
import { getLoyaltySettings, saveLoyaltySettings } from "@/lib/loyalty-server";
import { recordAudit } from "@/lib/audit";

/**
 * The shop's punch card: whether it is running, how many visits earn a reward,
 * and what the reward is. Everyone reads it — the till mentions it while a
 * customer is standing there — and the owner alone changes it.
 */
export async function GET() {
  try {
    await requireAuth();
    return NextResponse.json(await getLoyaltySettings());
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authSession = await requireOwner();
    const body = await req.json();
    const previous = await getLoyaltySettings();

    const visitsRequired =
      body.visitsRequired === undefined ? undefined : parseInt(String(body.visitsRequired), 10);
    if (visitsRequired !== undefined && (!Number.isFinite(visitsRequired) || visitsRequired < 1 || visitsRequired > 100)) {
      return NextResponse.json({ error: "Choose between 1 and 100 visits" }, { status: 400 });
    }

    const rewardText = body.rewardText === undefined ? undefined : String(body.rewardText).trim().slice(0, 120);
    if (rewardText !== undefined && rewardText.length === 0) {
      return NextResponse.json({ error: "Say what the reward is" }, { status: 400 });
    }

    await saveLoyaltySettings({
      ...(body.enabled === undefined ? {} : { enabled: Boolean(body.enabled) }),
      ...(visitsRequired === undefined ? {} : { visitsRequired }),
      ...(rewardText === undefined ? {} : { rewardText }),
      ...(body.rewardTextAr === undefined ? {} : { rewardTextAr: String(body.rewardTextAr).trim().slice(0, 120) }),
    });

    const now = await getLoyaltySettings();
    await recordAudit(authSession, {
      action: "UPDATE",
      entity: "SETTING",
      entityId: "loyalty",
      summary: `Loyalty ${now.enabled ? "on" : "off"}, ${now.visitsRequired} visits for "${now.rewardText}"`,
      details: previous,
    });

    return NextResponse.json(now);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[settings/loyalty]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
