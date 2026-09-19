import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBookingSettings } from "@/lib/booking-server";
import { CUSTOMER_FACING_BARBER } from "@/lib/barbers";
import { isRunning } from "@/lib/offers";
import { ratingsByBarber } from "@/lib/reviews";

/**
 * Read fresh every time. This route takes no session, so Next would otherwise
 * render it once at build and serve that copy from the edge — and the shop's
 * own changes (a barber hidden, a price, an offer, a rating) would not reach
 * the app until the next deploy.
 */
export const dynamic = "force-dynamic";


/**
 * What a customer may book: the services and barbers the shop has opened to
 * online booking. Public, because the booking screen shows this before anyone
 * signs in — it is the same thing a passer-by reads on the price list.
 */
export async function GET() {
  try {
    const settings = await getBookingSettings();
    const [services, barbers, offers, reviews] = await Promise.all([
      prisma.service.findMany({
        where: { isActive: true, bookableOnline: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, arabicName: true, defaultPrice: true, durationMinutes: true },
      }),
      prisma.barber.findMany({
        where: { isActive: true, bookableOnline: true, ...CUSTOMER_FACING_BARBER },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          bio: true,
          photo: true,
          services: { select: { serviceId: true } },
          // A few of their own cuts, because a customer picks a barber by the
          // work long before they pick one by the name. Three, not the twelve
          // on their profile: this rides along with the whole price list.
          photos: { orderBy: [{ position: "asc" }, { createdAt: "desc" }], take: 3, select: { id: true, image: true } },
        },
      }),
      prisma.offer.findMany({
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, titleAr: true, description: true, price: true, wasPrice: true, startsAt: true, endsAt: true, isActive: true },
      }),
      // Hidden ones count for nothing, here or anywhere else.
      prisma.review.findMany({ where: { hiddenAt: null }, select: { barberId: true, rating: true } }),
    ]);

    const ratings = ratingsByBarber(reviews);

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
        work: b.photos.map((p) => p.image),
        // Null average when nobody has reviewed them: unknown, not bad.
        rating: ratings[b.id] ?? { average: null, count: 0 },
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
