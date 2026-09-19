import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/auth";
import { getBookingSettings, findFreeSlots } from "@/lib/booking-server";
import { shopDateISO } from "@/lib/booking";
import { CUSTOMER_FACING_BARBER } from "@/lib/barbers";
import { nearestTimes, usualFor } from "@/lib/usual";

/**
 * "The usual" — their own habit, with times they could take it today.
 *
 * Answers with `{ usual: null }` for anybody the shop does not know well enough
 * yet, which is most people; the screen simply does not offer it then. Nothing
 * here books anything: it fills the booking screen in, and the customer still
 * presses the button.
 */
export async function GET() {
  try {
    const session = await requireCustomer();
    const settings = await getBookingSettings();

    // Both halves of their history. A booked cut is an appointment, a walk-in is
    // a visit, and a habit is a habit however they arrived — this shop's regulars
    // have walked in for years without booking once.
    const [booked, walkedIn] = await Promise.all([
      prisma.appointment.findMany({
        where: { customerId: session.user.customerId },
        orderBy: { startAt: "desc" },
        take: 20,
        select: {
          startAt: true,
          status: true,
          barberId: true,
          services: { select: { serviceId: true } },
        },
      }),
      // Skipping any visit with a booking behind it, or one cut would count twice
      // and weight the habit towards whatever happened to be booked.
      prisma.visit.findMany({
        where: { customerId: session.user.customerId, appointment: { is: null } },
        orderBy: { visitAt: "desc" },
        take: 20,
        select: {
          visitAt: true,
          barberId: true,
          items: { select: { serviceId: true } },
        },
      }),
    ]);

    const usual = usualFor(
      [
        ...booked.map((a) => ({
          startAt: a.startAt,
          status: a.status,
          barberId: a.barberId,
          serviceIds: a.services.map((s) => s.serviceId),
        })),
        // A visit exists because the cut happened and was paid for, which is
        // what COMPLETED means on the other side.
        ...walkedIn.map((v) => ({
          startAt: v.visitAt,
          status: "COMPLETED",
          barberId: v.barberId,
          serviceIds: v.items.map((i) => i.serviceId).filter((id): id is string => !!id),
        })),
      ],
      settings.timezone
    );
    if (!usual) return NextResponse.json({ usual: null });

    // A barber who has since left, or been taken out of the app, is not offered
    // again — the cut still is.
    const barber = usual.barberId
      ? await prisma.barber.findFirst({
          where: { id: usual.barberId, isActive: true, bookableOnline: true, ...CUSTOMER_FACING_BARBER },
          select: { id: true, name: true, photo: true },
        })
      : null;

    // Same for a service the shop has stopped offering online: findFreeSlots
    // returns nothing at all if one of them has gone, so check first.
    const services = await prisma.service.findMany({
      where: { id: { in: usual.serviceIds }, isActive: true, bookableOnline: true },
      select: { id: true, name: true, arabicName: true, defaultPrice: true, durationMinutes: true },
    });
    if (services.length !== usual.serviceIds.length) return NextResponse.json({ usual: null });

    if (!settings.onlineBookingEnabled) {
      return NextResponse.json({ usual: { barber, services, hour: usual.hour, times: [], from: usual.from } });
    }

    // The next few days, until three times near their hour turn up.
    const times: string[] = [];
    for (let ahead = 0; ahead < 7 && times.length < 3; ahead++) {
      const dateISO = shopDateISO(Date.now() + ahead * 86_400_000, settings.timezone);
      const slots = await findFreeSlots({
        dateISO,
        serviceIds: usual.serviceIds,
        barberId: barber?.id,
        onlineOnly: true,
      });

      const free = slots.anyBarber.filter((slot) => new Date(slot).getTime() > Date.now() + settings.minNoticeMinutes * 60_000);
      times.push(...nearestTimes(free, usual.hour, settings.timezone, 3 - times.length));
    }

    return NextResponse.json({
      usual: {
        barber,
        services,
        hour: usual.hour,
        from: usual.from,
        durationMinutes: services.reduce((sum, s) => sum + s.durationMinutes, 0),
        price: services.reduce((sum, s) => sum + s.defaultPrice, 0),
        times,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[customer/usual]", err);
    return NextResponse.json({ usual: null });
  }
}
