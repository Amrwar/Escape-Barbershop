import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBookingSettings } from "@/lib/booking-server";
import { DEFAULT_REMIND_HOURS_AHEAD, dueForReminder, reminderMessage, reviewRequestMessage } from "@/lib/reminders";
import { ASK_WITHIN_HOURS, shouldAskForReview, visitAsCut } from "@/lib/reviews";
import { birthdayMessage, shouldGreet } from "@/lib/birthdays";
import { dueTonight, nudgeMessage } from "@/lib/rebooking";
import { getBirthdaySettings } from "@/lib/loyalty-server";
import { sendPush } from "@/lib/push";

/**
 * The evening run. Vercel calls this once a day, and it does four things: it
 * reminds everyone with a booking in the next twenty hours, asks anyone who was
 * in the chair yesterday what they thought, wishes a happy birthday to anyone
 * whose day it is, and — when the shop has asked for it — tells a regular who is
 * past their own rhythm that it has been a while.
 *
 * Each appointment is stamped as it goes out, so a second run — a retry, a
 * manual trigger, a cron that fires twice — cannot remind the same person
 * again. That matters more than getting every reminder out on the first
 * attempt: a missed reminder is a shame, a repeated one is a nuisance.
 */
// Never a cached answer: this one sends messages.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Vercel sends this header on scheduled calls when CRON_SECRET is set.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const settings = await getBookingSettings();
    const horizon = new Date(Date.now() + DEFAULT_REMIND_HOURS_AHEAD * 3_600_000);

    const appointments = await prisma.appointment.findMany({
      where: {
        startAt: { gt: new Date(), lte: horizon },
        status: { in: ["PENDING", "CONFIRMED"] },
        reminderSentAt: null,
      },
      select: {
        id: true,
        startAt: true,
        status: true,
        reminderSentAt: true,
        customerId: true,
        barber: { select: { name: true } },
        services: { select: { serviceName: true } },
      },
    });

    const due = dueForReminder(appointments);
    let sent = 0;
    let reminded = 0;

    for (const appointment of due) {
      const delivered = await sendPush(
        { customerId: appointment.customerId },
        reminderMessage(
          {
            id: appointment.id,
            startAt: appointment.startAt,
            barberName: appointment.barber?.name ?? null,
            services: appointment.services.map((s) => s.serviceName),
          },
          "en",
          settings.timezone
        )
      );

      // Stamped whether or not a phone was listening: a customer with no
      // notifications on should not be retried every night for ever.
      await prisma.appointment.update({ where: { id: appointment.id }, data: { reminderSentAt: new Date() } });
      reminded += 1;
      sent += delivered;
    }

    // And, while we are here: yesterday's customers, asked once each.
    const finished = await prisma.appointment.findMany({
      where: {
        status: { in: ["COMPLETED", "COMPLETED_UNPAID"] },
        endAt: { gte: new Date(Date.now() - ASK_WITHIN_HOURS * 3_600_000), lte: new Date() },
        reviewAskedAt: null,
        review: { is: null },
      },
      select: {
        id: true,
        status: true,
        endAt: true,
        customerId: true,
        reviewAskedAt: true,
        barber: { select: { name: true } },
        services: { select: { serviceName: true } },
      },
    });

    // The walk-ins too, which is nearly all of them here: a cut rung up at the
    // till with no booking behind it is still a cut somebody has an opinion of.
    const walkedIn = await prisma.visit.findMany({
      where: {
        visitAt: { gte: new Date(Date.now() - ASK_WITHIN_HOURS * 3_600_000), lte: new Date() },
        reviewAskedAt: null,
        review: { is: null },
        appointment: { is: null },
      },
      select: {
        id: true,
        visitAt: true,
        customerId: true,
        reviewAskedAt: true,
        barber: { select: { name: true } },
        items: { select: { service: { select: { name: true } } } },
      },
    });

    let asked = 0;
    for (const appointment of finished.filter((a) => shouldAskForReview(a))) {
      sent += await sendPush(
        { customerId: appointment.customerId },
        reviewRequestMessage({
          id: appointment.id,
          startAt: appointment.endAt,
          barberName: appointment.barber?.name ?? null,
          services: appointment.services.map((s) => s.serviceName),
        })
      );

      // Stamped either way, for the same reason reminders are: one ask, ever.
      await prisma.appointment.update({ where: { id: appointment.id }, data: { reviewAskedAt: new Date() } });
      asked += 1;
    }

    for (const visit of walkedIn.filter((v) => shouldAskForReview({ ...visitAsCut(v), reviewAskedAt: v.reviewAskedAt }))) {
      sent += await sendPush(
        { customerId: visit.customerId },
        reviewRequestMessage({
          id: visit.id,
          startAt: visit.visitAt,
          barberName: visit.barber?.name ?? null,
          services: visit.items.map((i) => i.service?.name).filter((n): n is string => !!n),
        })
      );

      await prisma.visit.update({ where: { id: visit.id }, data: { reviewAskedAt: new Date() } });
      asked += 1;
    }

    // And the birthdays, if the shop keeps them.
    let greeted = 0;
    const birthdays = await getBirthdaySettings();
    if (birthdays.enabled) {
      const people = await prisma.customer.findMany({
        where: { birthday: { not: null } },
        select: { id: true, name: true, birthday: true, birthdayGreetedAt: true },
      });

      for (const person of people.filter((p) => shouldGreet(p, Date.now(), settings.timezone))) {
        sent += await sendPush({ customerId: person.id }, birthdayMessage(person.name, birthdays.messageText));
        // Stamped whether or not they have a phone listening, so the greeting
        // is a once-a-year thing rather than a nightly attempt.
        await prisma.customer.update({ where: { id: person.id }, data: { birthdayGreetedAt: new Date() } });
        greeted += 1;
      }
    }

    // And the regulars who are late by their own standard, if the shop wants it.
    let nudged = 0;
    if (settings.rebookingRemindersEnabled) {
      // Only customers with a login can be written to at all, so only they are
      // considered — and only their paid visits count as a rhythm.
      const customers = await prisma.customer.findMany({
        where: { user: { isNot: null }, visits: { some: {} } },
        select: {
          id: true,
          rebookNudgedAt: true,
          visits: { select: { visitAt: true, barberId: true }, orderBy: { visitAt: "desc" }, take: 12 },
          appointments: {
            where: { startAt: { gte: new Date() }, status: { in: ["PENDING", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS"] } },
            select: { id: true },
            take: 1,
          },
        },
      });

      const due = dueTonight(
        customers.map((customer) => ({
          customerId: customer.id,
          visits: customer.visits.map((v) => v.visitAt),
          hasUpcoming: customer.appointments.length > 0,
          nudgedAt: customer.rebookNudgedAt,
        }))
      );

      const barberNames = new Map(
        (await prisma.barber.findMany({ select: { id: true, name: true } })).map((b) => [b.id, b.name])
      );

      for (const row of due) {
        const customer = customers.find((c) => c.id === row.customerId);
        const lastBarberId = customer?.visits.find((v) => v.barberId)?.barberId ?? null;

        sent += await sendPush(
          { customerId: row.customerId },
          nudgeMessage(row, lastBarberId ? (barberNames.get(lastBarberId) ?? null) : null)
        );

        // Stamped whether or not a phone was listening, so the quiet period is
        // about the person and not about their device.
        await prisma.customer.update({ where: { id: row.customerId }, data: { rebookNudgedAt: new Date() } });
        nudged += 1;
      }
    }

    return NextResponse.json({ considered: appointments.length, reminded, asked, greeted, nudged, notificationsSent: sent });
  } catch (err) {
    console.error("[cron/reminders]", err);
    return NextResponse.json({ error: "Reminder run failed" }, { status: 500 });
  }
}
