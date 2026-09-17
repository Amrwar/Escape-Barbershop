/**
 * Who should be reminded, and what the message says. Pure, so the rule can be
 * tested without a phone, a database or a push service in the way.
 *
 * The rule is deliberately plain: an appointment is worth a reminder when it is
 * still standing, starts within the window the shop reminds ahead of, has not
 * already been reminded, and has not already happened. Anything cleverer would
 * be hard to explain to a customer who asks why they were not told.
 */

export const DEFAULT_REMIND_HOURS_AHEAD = 20;

export interface RemindableAppointment {
  id: string;
  startAt: Date | string;
  status: string;
  reminderSentAt?: Date | string | null;
}

const OPEN = ["PENDING", "CONFIRMED"];
const HOUR = 3_600_000;

export function shouldRemind(
  appointment: RemindableAppointment,
  now = Date.now(),
  hoursAhead = DEFAULT_REMIND_HOURS_AHEAD
): boolean {
  if (!OPEN.includes(appointment.status)) return false;
  if (appointment.reminderSentAt) return false;

  const start = new Date(appointment.startAt).getTime();
  if (Number.isNaN(start)) return false;
  // Already started, or too far off to be useful yet.
  if (start <= now) return false;
  return start - now <= hoursAhead * HOUR;
}

export function dueForReminder<T extends RemindableAppointment>(
  appointments: T[],
  now = Date.now(),
  hoursAhead = DEFAULT_REMIND_HOURS_AHEAD
): T[] {
  return appointments.filter((a) => shouldRemind(a, now, hoursAhead));
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

interface AppointmentForMessage {
  id: string;
  startAt: Date | string;
  barberName?: string | null;
  services: string[];
}

/**
 * Time and day as the customer reads it, in the shop's own timezone — and in
 * the same clock the app itself shows: 12-hour in English, 24-hour in Arabic.
 */
function when(startAt: Date | string, locale: string, timeZone: string) {
  const date = new Date(startAt);
  const time = new Intl.DateTimeFormat(locale === "ar-EG" ? locale : "en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: locale !== "ar-EG",
  }).format(date);
  const day = new Intl.DateTimeFormat(locale, { timeZone, weekday: "long", day: "numeric", month: "long" }).format(date);
  return { time, day };
}

export function bookingConfirmedMessage(
  appointment: AppointmentForMessage,
  lang: "en" | "ar" = "en",
  timeZone = "Africa/Cairo"
): PushMessage {
  const { time, day } = when(appointment.startAt, lang === "ar" ? "ar-EG" : "en-GB", timeZone);
  const services = appointment.services.join(" + ");
  const withWhom = appointment.barberName ? ` · ${appointment.barberName}` : "";

  return lang === "ar"
    ? {
        title: "تم تأكيد حجزك",
        body: `${day} الساعة ${time}${withWhom} — ${services}`,
        url: "/app/appointments",
        tag: `booked-${appointment.id}`,
      }
    : {
        title: "Booking confirmed",
        body: `${day} at ${time}${withWhom} — ${services}`,
        url: "/app/appointments",
        tag: `booked-${appointment.id}`,
      };
}

export function reminderMessage(
  appointment: AppointmentForMessage,
  lang: "en" | "ar" = "en",
  timeZone = "Africa/Cairo"
): PushMessage {
  const { time, day } = when(appointment.startAt, lang === "ar" ? "ar-EG" : "en-GB", timeZone);
  const withWhom = appointment.barberName ? ` مع ${appointment.barberName}` : "";

  return lang === "ar"
    ? {
        title: "تذكير بموعدك في إسكيب",
        body: `${day} الساعة ${time}${withWhom}`,
        url: "/app/appointments",
        tag: `remind-${appointment.id}`,
      }
    : {
        title: "Your appointment at Escape",
        body: `${day} at ${time}${appointment.barberName ? ` with ${appointment.barberName}` : ""}`,
        url: "/app/appointments",
        tag: `remind-${appointment.id}`,
      };
}
