import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireOwner } from "@/lib/auth";
import {
  getBirthdaySettings,
  getLoyaltySettings,
  getReferralSettings,
  saveBirthdaySettings,
  saveLoyaltySettings,
  saveReferralSettings,
} from "@/lib/loyalty-server";
import { recordAudit } from "@/lib/audit";

/**
 * The three ways the shop gives something back: the punch card, telling a
 * friend, and birthdays. All read by everyone — the till mentions them while a
 * customer is standing there — and all changed by the owner alone.
 */
export async function GET() {
  try {
    await requireAuth();
    const [loyalty, referral, birthday] = await Promise.all([
      getLoyaltySettings(),
      getReferralSettings(),
      getBirthdaySettings(),
    ]);
    return NextResponse.json({ loyalty, referral, birthday });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authSession = await requireOwner();
    const body = await req.json();

    if (body.loyalty) {
      const visitsRequired =
        body.loyalty.visitsRequired === undefined ? undefined : parseInt(String(body.loyalty.visitsRequired), 10);
      if (visitsRequired !== undefined && (!Number.isFinite(visitsRequired) || visitsRequired < 1 || visitsRequired > 100)) {
        return NextResponse.json({ error: "Choose between 1 and 100 visits" }, { status: 400 });
      }
      const rewardText =
        body.loyalty.rewardText === undefined ? undefined : String(body.loyalty.rewardText).trim().slice(0, 120);
      if (rewardText !== undefined && rewardText.length === 0) {
        return NextResponse.json({ error: "Say what the loyalty reward is" }, { status: 400 });
      }

      await saveLoyaltySettings({
        ...(body.loyalty.enabled === undefined ? {} : { enabled: Boolean(body.loyalty.enabled) }),
        ...(visitsRequired === undefined ? {} : { visitsRequired }),
        ...(rewardText === undefined ? {} : { rewardText }),
        ...(body.loyalty.rewardTextAr === undefined
          ? {}
          : { rewardTextAr: String(body.loyalty.rewardTextAr).trim().slice(0, 120) }),
      });
    }

    if (body.referral) {
      const rewardText =
        body.referral.rewardText === undefined ? undefined : String(body.referral.rewardText).trim().slice(0, 120);
      if (rewardText !== undefined && rewardText.length === 0) {
        return NextResponse.json({ error: "Say what the referral reward is" }, { status: 400 });
      }

      await saveReferralSettings({
        ...(body.referral.enabled === undefined ? {} : { enabled: Boolean(body.referral.enabled) }),
        ...(rewardText === undefined ? {} : { rewardText }),
        ...(body.referral.rewardTextAr === undefined
          ? {}
          : { rewardTextAr: String(body.referral.rewardTextAr).trim().slice(0, 120) }),
      });
    }

    if (body.birthday) {
      await saveBirthdaySettings({
        ...(body.birthday.enabled === undefined ? {} : { enabled: Boolean(body.birthday.enabled) }),
        ...(body.birthday.messageText === undefined
          ? {}
          : { messageText: String(body.birthday.messageText).trim().slice(0, 160) }),
        ...(body.birthday.messageTextAr === undefined
          ? {}
          : { messageTextAr: String(body.birthday.messageTextAr).trim().slice(0, 160) }),
      });
    }

    const [loyalty, referral, birthday] = await Promise.all([
      getLoyaltySettings(),
      getReferralSettings(),
      getBirthdaySettings(),
    ]);

    await recordAudit(authSession, {
      action: "UPDATE",
      entity: "SETTING",
      entityId: "rewards",
      summary: `Rewards: card ${loyalty.enabled ? "on" : "off"}, referrals ${
        referral.enabled ? "on" : "off"
      }, birthdays ${birthday.enabled ? "on" : "off"}`,
    });

    return NextResponse.json({ loyalty, referral, birthday });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[settings/rewards]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
