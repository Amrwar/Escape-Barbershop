import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBookingSettings, getShopHours } from "@/lib/booking-server";
import { shopDateISO, shopTime, shopWeekday } from "@/lib/booking";
import { CUSTOMER_FACING_BARBER } from "@/lib/barbers";

/**
 * Who is in, for the week ahead.
 *
 * "Is Abdullah in on Thursday" is a question customers ask the counter by phone,
 * and until now the app could only answer it sideways — by watching whose name
 * stopped appearing in the free times. This answers it directly.
 *
 * Public, like the price list and the screen on the wall: it says who is working
 * and when, which is what a shop puts on its door. It does not say why anybody
 * is off — a barber's own time-off reason is theirs, and none of it is returned
 * here, only that they are away.
 */
export const dynamic = "force-dynamic";

const DAYS_AHEAD = 7;

/** A barber's own hours narrow the shop's; they never widen them. */
function within(shop: { startMinute: number; endMinute: number }, own?: { startMinute: number; endMinute: number }) {
  if (!own) return { startMinute: shop.startMinute, endMinute: shop.endMinute };
  return {
    startMinute: Math.max(shop.startMinute, own.startMinute),
    endMinute: Math.min(shop.endMinute, own.endMinute),
  };
}

export async function GET() {
  try {
    const settings = await getBookingSettings();
    const now = Date.now();

    const from = new Date(now);
    const to = new Date(now + DAYS_AHEAD * 86_400_000);

    const [hours, barbers, ownHours, timeOff] = await Promise.all([
      getShopHours(),
      prisma.barber.findMany({
        where: { isActive: true, bookableOnline: true, ...CUSTOMER_FACING_BARBER },
        orderBy: { name: "asc" },
        select: { id: true, name: true, photo: true },
      }),
      prisma.barberWorkingHours.findMany({
        select: { barberId: true, weekday: true, startMinute: true, endMinute: true, isWorking: true },
      }),
      // Only time off somebody has actually approved keeps a barber off the
      // roster. A request nobody has answered changes nothing, here or anywhere.
      prisma.barberTimeOff.findMany({
        where: { status: "APPROVED", startAt: { lt: to }, endAt: { gt: from } },
        select: { barberId: true, startAt: true, endAt: true },
      }),
    ]);

    const days = Array.from({ length: DAYS_AHEAD }, (_, i) => {
      const at = now + i * 86_400_000;
      const date = shopDateISO(at, settings.timezone);
      const weekday = shopWeekday(at, settings.timezone);
      const shopDay = hours.find((h) => h.weekday === weekday);

      const open = !!shopDay?.isOpen;
      const working = open
        ? barbers.filter((barber) => {
            const own = ownHours.find((h) => h.barberId === barber.id && h.weekday === weekday);
            if (own && !own.isWorking) return false;

            // Away for any part of this day counts as away for it: a customer
            // deciding which day to come does not need the half-hours.
            //
            // The window is the shop's own midnight to midnight, not UTC's.
            // Building it from the date string as if it were UTC shifted every
            // day by the Cairo offset, so a day off could be read against the
            // wrong twenty-four hours — invisible from a machine west of UTC,
            // and caught by CI, which runs on it.
            const dayStart = shopTime(date, 0, settings.timezone);
            const dayEnd = shopTime(date, 24 * 60, settings.timezone);
            const away = timeOff.some(
              (t) =>
                t.barberId === barber.id &&
                new Date(t.startAt).getTime() < dayEnd &&
                new Date(t.endAt).getTime() > dayStart
            );
            if (away) return false;

            const span = within(
              { startMinute: shopDay!.startMinute, endMinute: shopDay!.endMinute },
              own ?? undefined
            );
            // A barber whose own hours fall outside the shop's is not in today.
            return span.endMinute > span.startMinute;
          })
        : [];

      return {
        date,
        weekday,
        open,
        opensAt: open ? shopDay!.startMinute : null,
        closesAt: open ? shopDay!.endMinute : null,
        barbers: working.map((b) => ({ id: b.id, name: b.name, photo: b.photo })),
      };
    });

    return NextResponse.json({ days });
  } catch (err) {
    console.error("[customer/roster]", err);
    return NextResponse.json({ days: [] });
  }
}
