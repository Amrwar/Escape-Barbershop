import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/auth";
import { findFreeSlots, getBookingSettings } from "@/lib/booking-server";
import { shopDateISO } from "@/lib/booking";
import { MINUTE } from "@/lib/booking";

/**
 * Free times for a customer. Only bookable services and barbers, and only
 * within the window the shop has opened — the notice period is enforced here
 * as well as when the booking is saved.
 */
export async function GET(req: NextRequest) {
  try {
    await requireCustomer();
    const settings = await getBookingSettings();
    if (!settings.onlineBookingEnabled) {
      return NextResponse.json({ error: "Online booking is closed at the moment", anyBarber: [], perBarber: [] }, { status: 403 });
    }

    const { searchParams } = req.nextUrl;
    const date = searchParams.get("date") || shopDateISO(Date.now(), settings.timezone);
    const serviceIds = (searchParams.get("serviceIds") ?? "").split(",").filter(Boolean);
    const barberId = searchParams.get("barberId");

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }
    if (serviceIds.length === 0) {
      return NextResponse.json({ error: "Please choose a service" }, { status: 400 });
    }

    // Nothing beyond the window the shop has opened.
    const lastDay = shopDateISO(Date.now() + settings.maxDaysAhead * 24 * 60 * MINUTE, settings.timezone);
    if (date > lastDay) {
      return NextResponse.json({ date, durationMinutes: 0, price: 0, services: [], perBarber: [], anyBarber: [] });
    }

    const result = await findFreeSlots({
      dateISO: date,
      serviceIds,
      barberId: barberId || undefined,
      onlineOnly: true,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[customer/slots]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
