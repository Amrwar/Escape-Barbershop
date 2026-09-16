"use client";

import { useTranslation } from "@/lib/i18n";
import { Badge } from "@/components/ui/Badge";
import { APPOINTMENT_BADGE, appointmentStatusKey } from "@/lib/appointments";

export interface CustomerAppointment {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  durationMinutes: number;
  totalPrice: number;
  barber: { id: string; name: string; photo: string | null } | null;
  services: { id: string; serviceId: string; serviceName: string; price: number; durationMinutes: number }[];
}

/** One appointment, as the customer reads it: when, who, what, how much. */
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
  const past = appointment.status === "CANCELLED" || appointment.status === "NO_SHOW";

  return (
    <div
      className={`card p-4 ${highlight ? "border-primary-200 bg-primary-50/40" : ""} ${past ? "opacity-70" : ""}`}
    >
      <div className="flex items-start gap-3">
        <div className="text-center shrink-0 w-16">
          <div className="text-lg font-bold text-gray-900 tabular-nums">{fmtTime(appointment.startAt)}</div>
          <div className="text-[11px] text-gray-500">{fmtDate(appointment.startAt)}</div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900 truncate">
            {appointment.services.map((s) => s.serviceName).join(" + ")}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {appointment.barber?.name ?? t("appointments.anyBarber")} · {appointment.durationMinutes} {t("appointments.minutesShort")}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={APPOINTMENT_BADGE[appointment.status] ?? "gray"}>
              {t(appointmentStatusKey(appointment.status))}
            </Badge>
            <span className="text-sm font-semibold text-gray-900 tabular-nums">{fmtCurrency(appointment.totalPrice)}</span>
          </div>
        </div>
      </div>

      {actions && <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2">{actions}</div>}
    </div>
  );
}
