import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { getBookingSettings } from "@/lib/booking-server";
import { upcomingBirthdays } from "@/lib/birthdays";

/**
 * Whose birthday is coming up, soonest first.
 *
 * Read by the shop, not the customer: this is the list somebody picks up the
 * phone with. A greeting goes out by itself only to customers who turned
 * notifications on, which is far from all of them.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const settings = await getBookingSettings();

    const days = Math.min(90, Math.max(1, parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10) || 30));
    const people = await prisma.customer.findMany({
      where: { birthday: { not: null } },
      select: { id: true, name: true, phone: true, birthday: true },
    });

    return NextResponse.json({
      days,
      birthdays: upcomingBirthdays(people, days, Date.now(), settings.timezone).map((row) => ({
        ...row.person,
        daysAway: row.daysAway,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
