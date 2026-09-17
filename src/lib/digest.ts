/**
 * The owner's nightly line.
 *
 * One notification at closing that answers the question they would otherwise
 * open the laptop for: what did we take, who came, what did we lose, and how
 * does tomorrow look. Everything in it is counted from the same rows as the day
 * journal, so it can never tell a different story from the reports.
 *
 * It is written to fit a phone's lock screen — a body a notification will show
 * in full rather than cut in half.
 */

export interface DayNumbers {
  /** Paid visits today. */
  visits: number;
  takings: number;
  cash: number;
  card: number;
  instapay: number;
  /** Booked and not turned up. */
  noShows: number;
  /** What those missed appointments were quoted at. */
  noShowValue: number;
  /** Bookings on the diary for tomorrow. */
  tomorrow: number;
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
}

const money = (amount: number, lang: "en" | "ar") =>
  new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-GB", { maximumFractionDigits: 0 }).format(Math.round(amount));

/** Is there anything worth waking a phone for? */
export function worthSending(day: DayNumbers): boolean {
  return day.visits > 0 || day.noShows > 0 || day.tomorrow > 0;
}

export function digestMessage(day: DayNumbers, dateISO: string, lang: "en" | "ar" = "en"): PushMessage {
  const split = [
    day.cash > 0 ? `${money(day.cash, lang)} ${lang === "ar" ? "نقدي" : "cash"}` : null,
    day.card > 0 ? `${money(day.card, lang)} ${lang === "ar" ? "فيزا" : "card"}` : null,
    day.instapay > 0 ? `${money(day.instapay, lang)} InstaPay` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const lines =
    lang === "ar"
      ? [
          `${money(day.takings, lang)} جنيه من ${day.visits} زيارة`,
          split || null,
          day.noShows > 0 ? `${day.noShows} لم يحضروا (${money(day.noShowValue, lang)} جنيه)` : null,
          day.tomorrow > 0 ? `غداً: ${day.tomorrow} حجز` : "غداً: لا حجوزات بعد",
        ]
      : [
          `${money(day.takings, lang)} EGP from ${day.visits} ${day.visits === 1 ? "visit" : "visits"}`,
          split || null,
          day.noShows > 0
            ? `${day.noShows} no-${day.noShows === 1 ? "show" : "shows"} (${money(day.noShowValue, lang)} EGP)`
            : null,
          day.tomorrow > 0
            ? `Tomorrow: ${day.tomorrow} booked`
            : "Tomorrow: nothing booked yet",
        ];

  return {
    title: lang === "ar" ? "ملخص اليوم — إسكيب" : "Today at Escape",
    body: lines.filter(Boolean).join("\n"),
    url: "/reports/insights",
    tag: `digest-${dateISO}`,
  };
}
