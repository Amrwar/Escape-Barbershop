import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireOwner } from "@/lib/auth";
import { VISA_COMMISSION_KEY, getVisaCommissionPercent } from "@/lib/finance";

// The card-machine commission rate. Every screen that shows a card total reads
// it from here, so changing it here changes the whole journal at once.
export async function GET() {
  try {
    await requireAuth();
    return NextResponse.json({ visaCommissionPercent: await getVisaCommissionPercent() });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireOwner();
    const { visaCommissionPercent } = await req.json();
    const pct = parseFloat(visaCommissionPercent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return NextResponse.json({ error: "invalid_percent" }, { status: 400 });
    }
    await prisma.setting.upsert({
      where: { key: VISA_COMMISSION_KEY },
      update: { value: String(pct) },
      create: { key: VISA_COMMISSION_KEY, value: String(pct) },
    });
    return NextResponse.json({ visaCommissionPercent: pct });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
