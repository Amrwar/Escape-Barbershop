import { prisma } from "./prisma";
import { getBookingSettings } from "./booking-server";
import { shopDateISO } from "./booking";
import { sendPushQuietly } from "./push";
import { nextInLine, offerExpiry, offerMessage, type FreedSlot, type WaitingCustomer } from "./waitlist";

/**
 * The database side of the waiting list: noticing a chair has come free, and
 * telling the right person about it.
 *
 * Called whenever an appointment is cancelled, from either side of the shop.
 * It never throws at its caller — a cancellation must go through whether or not
 * anybody could be told about it.
 */

/** Everyone on the list for a day, with the length of what they asked for. */
export async function waitingFor(dateISO: string): Promise<WaitingCustomer[]> {
  const entries = await prisma.waitlistEntry.findMany({
    where: { dateISO, status: { in: ["WAITING", "OFFERED"] } },
    include: { services: { include: { service: { select: { durationMinutes: true } } } } },
  });

  return entries.map((entry) => ({
    id: entry.id,
    customerId: entry.customerId,
    dateISO: entry.dateISO,
    barberId: entry.barberId,
    status: entry.status,
    durationMinutes: entry.services.reduce((sum, line) => sum + line.service.durationMinutes, 0),
    createdAt: entry.createdAt,
    offerExpiresAt: entry.offerExpiresAt,
  }));
}

/**
 * A chair has come free: offer it to whoever has waited longest and can use it.
 *
 * The offer is written down before the notification goes out, so a slow push
 * can never hand the same slot to two people.
 */
export async function offerFreedSlot(appointmentId: string): Promise<{ offeredTo: string | null }> {
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { startAt: true, endAt: true, barberId: true, barber: { select: { name: true } } },
    });
    if (!appointment) return { offeredTo: null };

    const settings = await getBookingSettings();
    const slot: FreedSlot = {
      dateISO: shopDateISO(appointment.startAt.getTime(), settings.timezone),
      startAt: appointment.startAt,
      minutes: Math.round((appointment.endAt.getTime() - appointment.startAt.getTime()) / 60_000),
      barberId: appointment.barberId,
    };

    // A slot in the past is no use to anybody.
    if (appointment.startAt.getTime() <= Date.now()) return { offeredTo: null };

    const entries = await waitingFor(slot.dateISO);
    const chosen = nextInLine(entries, slot);
    if (!chosen) return { offeredTo: null };

    await prisma.waitlistEntry.update({
      where: { id: chosen.id },
      data: {
        status: "OFFERED",
        offeredStartAt: appointment.startAt,
        offeredAt: new Date(),
        offerExpiresAt: offerExpiry(),
      },
    });

    sendPushQuietly(
      { customerId: chosen.customerId },
      offerMessage(slot, appointment.barber?.name ?? null, "en", settings.timezone)
    );

    return { offeredTo: chosen.customerId };
  } catch (err) {
    // A cancellation must never fail because the waiting list did.
    console.error("[waitlist] could not offer the freed slot", err);
    return { offeredTo: null };
  }
}

/**
 * Tidy up: close entries for days that have been and gone, and let lapsed
 * offers fall back to waiting so the next cancellation can pass them on.
 *
 * Run whenever the list is touched, and once a night. There is no timer here on
 * purpose — the host runs scheduled work once a day, so anything that depends
 * on a minute-by-minute sweep would be a promise the system cannot keep.
 */
export async function tidyWaitlist(): Promise<{ closed: number; lapsed: number }> {
  const settings = await getBookingSettings();
  const today = shopDateISO(Date.now(), settings.timezone);

  const [closed, lapsed] = await Promise.all([
    prisma.waitlistEntry.updateMany({
      where: { status: { in: ["WAITING", "OFFERED"] }, dateISO: { lt: today } },
      data: { status: "CLOSED" },
    }),
    prisma.waitlistEntry.updateMany({
      where: { status: "OFFERED", offerExpiresAt: { lt: new Date() } },
      data: { status: "WAITING", offeredStartAt: null, offeredAt: null, offerExpiresAt: null },
    }),
  ]);

  return { closed: closed.count, lapsed: lapsed.count };
}
