import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireOwner } from "@/lib/auth";
import { bookingSettingsSchema } from "@/lib/validations";
import { recordAudit } from "@/lib/audit";
import { getBookingSettings, getShopHours, saveBookingSettings, saveShopHours } from "@/lib/booking-server";

export async function GET() {
  try {
    await requireAuth();
    const [settings, hours] = await Promise.all([getBookingSettings(), getShopHours()]);
    return NextResponse.json({ settings, hours });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authSession = await requireOwner();
    const body = await req.json();
    const data = bookingSettingsSchema.parse(body);

    if (data.settings) await saveBookingSettings(data.settings);
    if (data.hours) await saveShopHours(data.hours);

    const [settings, hours] = await Promise.all([getBookingSettings(), getShopHours()]);

    await recordAudit(authSession, {
      action: "UPDATE",
      entity: "SETTING",
      summary: "Updated the booking settings",
      details: { settings, hours },
    });

    return NextResponse.json({ settings, hours });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[booking/settings]", err);
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }
}
