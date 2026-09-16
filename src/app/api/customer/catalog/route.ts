import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBookingSettings } from "@/lib/booking-server";
import { CUSTOMER_FACING_BARBER } from "@/lib/barbers";
import { isRunning } from "@/lib/offers";

/**
 * What a customer may book: the services and barbers the shop has opened to
 * online booking. Public, because the booking screen shows this before anyone
 * signs in — it is the same thing a passer-by reads on the price list.
 */
export async function GET() {
  try {
    const settings = await getBookingSettings();
    const [services, barbers, offers] = await Promise.all([
      prisma.service.findMany({
        where: { isActive: true, bookableOnline: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, arabicName: true, defaultPrice: true, durationMinutes: true },
      }),
      prisma.barber.findMany({
        where: { isActive: true, bookableOnline: true, ...CUSTOMER_FACING_BARBER },
        orderBy: { name: "asc" },
        select: { id: true, name: true, bio: true, photo: true, services: { select: { serviceId: true } } },
      }),
      prisma.offer.findMany({
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, titleAr: true, description: true, price: true, wasPrice: true, startsAt: true, endsAt: true, isActive: true },
      }),
    ]);

    return NextResponse.json({
      // Only what is running today: a scheduled or finished offer is the shop's
      // business, not the customer's.
      offers: offers.filter((o) => isRunning(o)),
      services,
      barbers: barbers.map((b) => ({
        id: b.id,
        name: b.name,
        bio: b.bio,
        photo: b.photo,
        // An empty list means this barber does everything.
        serviceIds: b.services.map((s) => s.serviceId),
      })),
      booking: {
        onlineBookingEnabled: settings.onlineBookingEnabled,
        maxDaysAhead: settings.maxDaysAhead,
        minNoticeMinutes: settings.minNoticeMinutes,
        cancelWindowMinutes: settings.cancelWindowMinutes,
        timezone: settings.timezone,
      },
    });
  } catch (err) {
    console.error("[customer/catalog]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
