import { prisma } from "./prisma";
import { CUSTOMER_FACING_BARBER } from "./barbers";
import {
  DEFAULT_BOOKING_SETTINGS,
  MINUTE,
  availableSlots,
  isBlocking,
  shopTime,
  workingWindow,
  type BookingSettings,
  type DayHours,
  type Interval,
} from "./booking";

/**
 * The database side of booking: the settings, the opening hours, and working
 * out which times are genuinely free. The rules themselves live in ./booking,
 * which stays pure so it can be tested on its own.
 */

const SETTING_KEYS = {
  slotMinutes: "booking_slot_minutes",
  minNoticeMinutes: "booking_min_notice_minutes",
  maxDaysAhead: "booking_max_days_ahead",
  bufferMinutes: "booking_buffer_minutes",
  cancelWindowMinutes: "booking_cancel_window_minutes",
  timezone: "shop_timezone",
  onlineBookingEnabled: "booking_online_enabled",
  rebookingRemindersEnabled: "booking_rebooking_enabled",
} as const;

/** Escape's normal week: open every day, 11:00 to 23:00. */
export const DEFAULT_SHOP_HOURS: DayHours[] = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  startMinute: 11 * 60,
  endMinute: 23 * 60,
  isOpen: true,
}));

export async function getBookingSettings(): Promise<BookingSettings> {
  const rows = await prisma.setting
    .findMany({ where: { key: { in: Object.values(SETTING_KEYS) } } })
    .catch((err) => {
      console.error("[booking] settings lookup failed", err);
      return [] as { key: string; value: string }[];
    });
  const value = (key: string) => rows.find((r) => r.key === key)?.value;
  const number = (key: string, fallback: number) => {
    const n = parseInt(value(key) ?? "", 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return {
    slotMinutes: Math.max(5, number(SETTING_KEYS.slotMinutes, DEFAULT_BOOKING_SETTINGS.slotMinutes)),
    minNoticeMinutes: number(SETTING_KEYS.minNoticeMinutes, DEFAULT_BOOKING_SETTINGS.minNoticeMinutes),
    maxDaysAhead: Math.max(1, number(SETTING_KEYS.maxDaysAhead, DEFAULT_BOOKING_SETTINGS.maxDaysAhead)),
    bufferMinutes: number(SETTING_KEYS.bufferMinutes, DEFAULT_BOOKING_SETTINGS.bufferMinutes),
    cancelWindowMinutes: number(SETTING_KEYS.cancelWindowMinutes, DEFAULT_BOOKING_SETTINGS.cancelWindowMinutes),
    timezone: value(SETTING_KEYS.timezone) || DEFAULT_BOOKING_SETTINGS.timezone,
    onlineBookingEnabled: (value(SETTING_KEYS.onlineBookingEnabled) ?? "1") !== "0",
    // Off until the shop asks for it: writing to people who did not ask is how
    // a shop loses their notifications for good.
    rebookingRemindersEnabled: (value(SETTING_KEYS.rebookingRemindersEnabled) ?? "0") === "1",
  };
}

export async function saveBookingSettings(input: Partial<BookingSettings>): Promise<void> {
  const entries = Object.entries(SETTING_KEYS).filter(([field]) => input[field as keyof BookingSettings] !== undefined);
  await prisma.$transaction(
    entries.map(([field, key]) => {
      const raw = input[field as keyof BookingSettings];
      const value = typeof raw === "boolean" ? (raw ? "1" : "0") : String(raw);
      return prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
    })
  );
}

/** The shop's week. Falls back to the standard hours until they are edited. */
export async function getShopHours(): Promise<DayHours[]> {
  const rows = await prisma.shopHours.findMany().catch((err) => {
    console.error("[booking] shop hours lookup failed", err);
    return [];
  });
  return rows.length > 0 ? rows : DEFAULT_SHOP_HOURS;
}

export async function saveShopHours(days: DayHours[]): Promise<void> {
  await prisma.$transaction(
    days.map((d) =>
      prisma.shopHours.upsert({
        where: { weekday: d.weekday },
        update: { startMinute: d.startMinute, endMinute: d.endMinute, isOpen: d.isOpen ?? true },
        create: { weekday: d.weekday, startMinute: d.startMinute, endMinute: d.endMinute, isOpen: d.isOpen ?? true },
      })
    )
  );
}

export interface SlotQuery {
  dateISO: string;
  serviceIds: string[];
  /** Leave out for "any barber". */
  barberId?: string | null;
  /** Staff booking by phone may ignore the notice period. */
  ignoreNotice?: boolean;
  /** Reschedule: the appointment being moved should not block its own slot. */
  excludeAppointmentId?: string;
  /** Online booking only offers barbers and services marked bookable. */
  onlineOnly?: boolean;
}

export interface BarberSlots {
  barberId: string;
  barberName: string;
  slots: string[];
}

export interface SlotResult {
  date: string;
  durationMinutes: number;
  price: number;
  services: { id: string; name: string; arabicName: string | null; price: number; durationMinutes: number }[];
  perBarber: BarberSlots[];
  /** Every time free with at least one barber, for the "any barber" choice. */
  anyBarber: string[];
}

/**
 * The free start times for a set of services on one day. A barber is offered
 * only when the whole service fits inside their working hours with nothing
 * else in the way.
 */
export async function findFreeSlots(query: SlotQuery): Promise<SlotResult> {
  const settings = await getBookingSettings();
  const { timezone } = settings;

  const services = await prisma.service.findMany({
    where: {
      id: { in: query.serviceIds },
      isActive: true,
      ...(query.onlineOnly ? { bookableOnline: true } : {}),
    },
    select: { id: true, name: true, arabicName: true, defaultPrice: true, durationMinutes: true },
  });
  if (services.length === 0 || services.length !== new Set(query.serviceIds).size) {
    return { date: query.dateISO, durationMinutes: 0, price: 0, services: [], perBarber: [], anyBarber: [] };
  }

  const durationMinutes = services.reduce((s, x) => s + x.durationMinutes, 0);
  const price = services.reduce((s, x) => s + x.defaultPrice, 0);

  // The day in shop time, plus a margin so an appointment starting the evening
  // before but running past midnight still counts as busy.
  const dayStart = new Date(shopTime(query.dateISO, 0, timezone));
  const dayEnd = new Date(shopTime(query.dateISO, 24 * 60, timezone));

  const barbers = await prisma.barber.findMany({
    where: {
      isActive: true,
      ...(query.barberId ? { id: query.barberId } : {}),
      ...(query.onlineOnly ? { bookableOnline: true, ...CUSTOMER_FACING_BARBER } : {}),
    },
    select: {
      id: true,
      name: true,
      workingHours: true,
      services: { select: { serviceId: true } },
      timeOff: { where: { startAt: { lt: dayEnd }, endAt: { gt: dayStart } }, select: { startAt: true, endAt: true } },
      appointments: {
        where: { startAt: { lt: dayEnd }, endAt: { gt: dayStart }, ...(query.excludeAppointmentId ? { id: { not: query.excludeAppointmentId } } : {}) },
        select: { id: true, startAt: true, endAt: true, status: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const shopHours = await getShopHours();
  const earliestStart = query.ignoreNotice ? undefined : Date.now() + settings.minNoticeMinutes * MINUTE;

  const perBarber: BarberSlots[] = [];
  for (const barber of barbers) {
    // A barber with no service list does everything; otherwise they must do all
    // the services in the booking.
    const canDo =
      barber.services.length === 0 || services.every((s) => barber.services.some((bs) => bs.serviceId === s.id));
    if (!canDo) continue;

    const window = workingWindow(query.dateISO, shopHours, barber.workingHours, timezone);
    if (!window) continue;

    const busy: Interval[] = [
      ...barber.appointments
        .filter((a) => isBlocking(a.status))
        .map((a) => ({ start: a.startAt.getTime(), end: a.endAt.getTime() })),
      ...barber.timeOff.map((t) => ({ start: t.startAt.getTime(), end: t.endAt.getTime() })),
    ];

    const slots = availableSlots({
      window,
      durationMinutes,
      slotMinutes: settings.slotMinutes,
      bufferMinutes: settings.bufferMinutes,
      busy,
      earliestStart,
    });
    if (slots.length > 0) {
      perBarber.push({ barberId: barber.id, barberName: barber.name, slots: slots.map((s) => new Date(s).toISOString()) });
    }
  }

  const anyBarber = Array.from(new Set(perBarber.flatMap((b) => b.slots))).sort();

  return {
    date: query.dateISO,
    durationMinutes,
    price,
    services: services.map((s) => ({
      id: s.id,
      name: s.name,
      arabicName: s.arabicName,
      price: s.defaultPrice,
      durationMinutes: s.durationMinutes,
    })),
    perBarber,
    anyBarber,
  };
}

/** Whether a barber is free for exactly this span. Used when saving a booking. */
export async function isBarberFree(
  barberId: string,
  start: Date,
  end: Date,
  opts: { excludeAppointmentId?: string; bufferMinutes: number }
): Promise<boolean> {
  const pad = opts.bufferMinutes * MINUTE;
  const from = new Date(start.getTime() - pad);
  const to = new Date(end.getTime() + pad);

  const [clash, timeOff] = await Promise.all([
    prisma.appointment.findFirst({
      where: {
        barberId,
        status: { in: ["PENDING", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED"] },
        startAt: { lt: to },
        endAt: { gt: from },
        ...(opts.excludeAppointmentId ? { id: { not: opts.excludeAppointmentId } } : {}),
      },
      select: { id: true },
    }),
    prisma.barberTimeOff.findFirst({
      where: { barberId, startAt: { lt: end }, endAt: { gt: start } },
      select: { id: true },
    }),
  ]);
  return !clash && !timeOff;
}
