"use client";

import { useTranslation } from "@/lib/i18n";
import { appointmentStatusKey } from "@/lib/appointments";
import { Avatar, Pill } from "./kit";

export interface CustomerAppointment {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  durationMinutes: number;
  totalPrice: number;
  barber: { id: string; name: string; photo: string | null } | null;
  /** What the customer asked for when booking. Sent by the API since the
   *  beginning and never once shown back to them until now. */
  notes?: string | null;
  depositAmount?: number;
  depositStatus?: string | null;
  depositRef?: string | null;
  services: { id: string; serviceId: string; serviceName: string; price: number; durationMinutes: number }[];
}

const TONES: Record<string, "muted" | "brass" | "good" | "warn" | "bad"> = {
  CONFIRMED: "brass",
  PENDING: "warn",
  CHECKED_IN: "warn",
  IN_PROGRESS: "warn",
  COMPLETED: "good",
  COMPLETED_UNPAID: "bad",
  CANCELLED: "muted",
  NO_SHOW: "bad",
};

/** How far off it is, in words: "tomorrow", "in 3 days", "today". */
function whenText(startAt: string, t: (k: "app.today" | "app.tomorrow" | "app.inDays" | "app.past") => string): string {
  const start = new Date(startAt);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(start) - startOfDay(new Date())) / 86_400_000);
  if (days < 0) return t("app.past");
  if (days === 0) return t("app.today");
  if (days === 1) return t("app.tomorrow");
  return t("app.inDays").replace("{days}", String(days));
}

/**
 * One appointment. The next one gets the full treatment — big time, brass edge,
 * how soon it is — and the rest are quieter, so a list still reads as a list.
 */
export function AppointmentCard({
  appointment,
  highlight,
  actions,
}: {
  appointment: CustomerAppointment;
  highlight?: boolean;
  actions?: React.ReactNode;
}) {
  const { t, fmtCurrency, fmtDate, fmtTime } = useTranslation();
  const services = appointment.services.map((s) => s.serviceName).join(" + ");
  const faded = appointment.status === "CANCELLED" || appointment.status === "NO_SHOW";

  if (highlight) {
    return (
      <div className="c-card-raised animate-fade-up relative overflow-hidden p-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-accent to-transparent" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <Pill tone="brass">{whenText(appointment.startAt, t)}</Pill>
            <div className="c-display mt-3 text-4xl tabular-nums leading-none text-ink">{fmtTime(appointment.startAt)}</div>
            <div className="mt-1.5 text-sm text-soft">{fmtDate(appointment.startAt)}</div>
          </div>
          <div className="text-end">
            <div className="text-lg font-semibold tabular-nums text-ink">{fmtCurrency(appointment.totalPrice)}</div>
            <div className="mt-0.5 text-xs text-soft">
              {appointment.durationMinutes} {t("appointments.minutesShort")}
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3 border-t border-hair pt-4">
          <Avatar name={appointment.barber?.name ?? "?"} photo={appointment.barber?.photo} size={40} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-ink">{services}</div>
            <div className="text-xs text-soft">{appointment.barber?.name ?? t("appointments.anyBarber")}</div>
          </div>
        </div>

        {actions && <div className="mt-4 flex gap-2">{actions}</div>}
      </div>
    );
  }

  return (
    <div className={`c-card animate-fade-up p-4 ${faded ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-3">
        <div className="w-14 shrink-0 text-center">
          <div className="text-lg font-bold tabular-nums leading-none text-ink">{fmtTime(appointment.startAt)}</div>
          <div className="mt-1 text-[11px] text-soft">{fmtDate(appointment.startAt)}</div>
        </div>
        <div className="h-10 w-px bg-raised" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-ink">{services}</div>
          <div className="mt-0.5 truncate text-xs text-soft">
            {appointment.barber?.name ?? t("appointments.anyBarber")} · {appointment.durationMinutes}{" "}
            {t("appointments.minutesShort")}
          </div>
        </div>
        <div className="text-end">
          <div className="text-sm font-semibold tabular-nums text-ink">{fmtCurrency(appointment.totalPrice)}</div>
          <div className="mt-1">
            <Pill tone={TONES[appointment.status] ?? "muted"}>{t(appointmentStatusKey(appointment.status))}</Pill>
          </div>
        </div>
      </div>
      {appointment.notes && (
        <p className="mt-3 rounded-[3px] bg-accent-soft px-4 py-2.5 text-sm text-accent">{appointment.notes}</p>
      )}
      {actions && <div className="mt-3 flex gap-2 border-t border-hair pt-3">{actions}</div>}
    </div>
  );
}
