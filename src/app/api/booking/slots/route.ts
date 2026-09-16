import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { findFreeSlots, getBookingSettings } from "@/lib/booking-server";
import { shopDateISO } from "@/lib/booking";

/**
 * The free start times for a day. Staff get every bookable barber and may
 * ignore the notice period, since they are booking someone standing in front
 * of them or on the phone.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = req.nextUrl;
    const settings = await getBookingSettings();
    const date = searchParams.get("date") || shopDateISO(Date.now(), settings.timezone);
    const serviceIds = (searchParams.get("serviceIds") ?? "").split(",").filter(Boolean);
    const barberId = searchParams.get("barberId");

    if (serviceIds.length === 0) {
      return NextResponse.json({ error: "Pick at least one service" }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const result = await findFreeSlots({
      dateISO: date,
      serviceIds,
      barberId: barberId || undefined,
      ignoreNotice: searchParams.get("ignoreNotice") === "1",
      excludeAppointmentId: searchParams.get("excludeAppointmentId") || undefined,
    });

    return NextResponse.json({ ...result, settings });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[booking/slots]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
