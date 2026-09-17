"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n";
import { appointmentStatusKey } from "@/lib/appointments";
import { EmptyState, Pill, ScreenTitle, SectionTitle, Skeleton } from "@/components/customer/kit";

/**
 * A barber's day. The next customer sits at the top with what to know about
 * them; the rest of the day is below. Taking the money stays at the till, so
 * the actions here are only the ones a barber does with their hands full:
 * they are here, they are in the chair, they never came.
 */

interface Appointment {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  source: string;
  notes: string | null;
  durationMinutes: number;
  totalPrice: number;
  visitId: string | null;
  customer: { id: string; name: string; phone: string | null };
  services: { id: string; serviceName: string }[];
}

interface Day {
  date: string;
  appointments: Appointment[];
  summary: { open: number; completed: number; noShows: number; expectedTakings: number };
  earned: { visitCount: number; takings: number; commission: number; tips: number };
}

const TONES: Record<string, "muted" | "brass" | "good" | "warn" | "bad"> = {
  CONFIRMED: "brass",
  CHECKED_IN: "warn",
  IN_PROGRESS: "warn",
  COMPLETED: "good",
  COMPLETED_UNPAID: "bad",
  CANCELLED: "muted",
  NO_SHOW: "bad",
};

export default function BarberTodayPage() {
  const { t, fmtCurrency, fmtTime } = useTranslation();
  const [day, setDay] = useState<Day | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    fetch("/api/barber/today")
      .then((r) => r.json())
      .then((d) => setDay(d?.error ? null : d))
      .catch(() => setDay(null));
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const mark = async (a: Appointment, status: string) => {
    setBusyId(a.id);
    setError("");
    try {
      const res = await fetch(`/api/barber/appointments/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) setError((await res.json()).error ?? t("appointments.actionFailed"));
      load();
    } finally {
      setBusyId(null);
    }
  };

  if (!day) {
    return (
      <div className="space-y-3 pt-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  const live = day.appointments.filter((a) => a.status !== "CANCELLED");
  const next = live.find((a) => ["CONFIRMED", "CHECKED_IN", "IN_PROGRESS"].includes(a.status));
  const rest = live.filter((a) => a.id !== next?.id);

  return (
    <div className="space-y-6">
      <ScreenTitle title={t("barberApp.today")} hint={t("barberApp.todayHint")} />

      <section className="c-card-raised grid grid-cols-3 divide-x divide-hair rtl:divide-x-reverse">
        <Stat label={t("barberApp.done")} value={String(day.summary.completed)} />
        <Stat label={t("barberApp.toCome")} value={String(day.summary.open)} />
        <Stat label={t("barberApp.earnedToday")} value={fmtCurrency(day.earned.commission + day.earned.tips)} tone="brass" />
      </section>

      {error && <div className="rounded-[3px] border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div>}

      {live.length === 0 ? (
        <EmptyState icon="calendar" title={t("barberApp.nothingToday")} hint={t("barberApp.nothingTodayHint")} />
      ) : (
        <>
          {next && (
            <section>
              <SectionTitle>{t("barberApp.nextUp")}</SectionTitle>
              <div className="c-card-raised animate-fade-up p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="c-display text-3xl tabular-nums leading-none">{fmtTime(next.startAt)}</div>
                    <div className="mt-1.5 text-sm text-soft">
                      {next.services.map((s) => s.serviceName).join(" + ")}
                    </div>
                  </div>
                  <Pill tone={TONES[next.status] ?? "muted"}>{t(appointmentStatusKey(next.status))}</Pill>
                </div>

                <Link
                  href={`/barber/customers/${next.customer.id}`}
                  className="mt-4 flex items-center justify-between rounded-[3px] border border-hair bg-surface px-4 py-3 transition-colors hover:border-hair"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{next.customer.name}</div>
                    <div className="text-xs text-soft">{t("barberApp.seeHistory")}</div>
                  </div>
                  <span className="text-faint">›</span>
                </Link>

                {next.notes && (
                  <p className="mt-3 rounded-[3px] bg-accent-soft px-4 py-2.5 text-sm text-accent">{next.notes}</p>
                )}

                <div className="mt-4 flex gap-2">
                  {next.status === "CONFIRMED" && (
                    <button onClick={() => mark(next, "CHECKED_IN")} disabled={busyId === next.id} className="c-btn-secondary flex-1">
                      {t("barberApp.arrived")}
                    </button>
                  )}
                  {(next.status === "CONFIRMED" || next.status === "CHECKED_IN") && (
                    <button onClick={() => mark(next, "IN_PROGRESS")} disabled={busyId === next.id} className="c-btn-primary flex-1">
                      {t("barberApp.start")}
                    </button>
                  )}
                  {next.status === "IN_PROGRESS" && (
                    <div className="flex-1 rounded-[3px] border border-hair px-4 py-3 text-center text-sm text-soft">
                      {t("barberApp.tillTakesPayment")}
                    </div>
                  )}
                  {next.status === "CONFIRMED" && (
                    <button
                      onClick={() => mark(next, "NO_SHOW")}
                      disabled={busyId === next.id}
                      className="c-btn-ghost text-red-300 hover:bg-red-400/10"
                    >
                      {t("appointments.noShow")}
                    </button>
                  )}
                </div>
              </div>
            </section>
          )}

          {rest.length > 0 && (
            <section>
              <SectionTitle>{t("barberApp.restOfDay")}</SectionTitle>
              <div className="space-y-2">
                {rest.map((a) => (
                  <Link
                    key={a.id}
                    href={`/barber/customers/${a.customer.id}`}
                    className="c-card flex items-center gap-3 p-4 transition-colors hover:border-hair"
                  >
                    <div className="w-14 shrink-0 text-center">
                      <div className="font-bold tabular-nums leading-none">{fmtTime(a.startAt)}</div>
                      <div className="mt-1 text-[11px] text-faint">
                        {a.durationMinutes} {t("appointments.minutesShort")}
                      </div>
                    </div>
                    <div className="h-9 w-px bg-raised" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{a.customer.name}</div>
                      <div className="truncate text-xs text-soft">{a.services.map((s) => s.serviceName).join(", ")}</div>
                    </div>
                    <Pill tone={TONES[a.status] ?? "muted"}>{t(appointmentStatusKey(a.status))}</Pill>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "plain" }: { label: string; value: string; tone?: "plain" | "brass" }) {
  return (
    <div className="px-3 py-4 text-center">
      <div className={`text-xl font-bold tabular-nums ${tone === "brass" ? "text-accent" : "text-ink"}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-soft">{label}</div>
    </div>
  );
}
