import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/auth";
import { codeFor, standingFor } from "@/lib/referrals-server";
import { getReferralSettings } from "@/lib/loyalty-server";

/**
 * "Tell a friend": the customer's own code, and how many friends have come in.
 *
 * The code is made the first time they open this screen, so a shop that never
 * runs referrals never fills its table with codes nobody asked for.
 */
export async function GET() {
  try {
    const session = await requireCustomer();
    const settings = await getReferralSettings();
    if (!settings.enabled) return NextResponse.json({ enabled: false });

    const [code, standing] = await Promise.all([
      codeFor(session.user.customerId),
      standingFor(session.user.customerId),
    ]);

    return NextResponse.json({
      enabled: true,
      code,
      rewardText: settings.rewardText,
      rewardTextAr: settings.rewardTextAr,
      standing,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
