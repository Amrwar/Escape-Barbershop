"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n";
import { Avatar, EmptyState, ScreenTitle, Skeleton } from "@/components/customer/kit";

/**
 * Who is in, for the week ahead.
 *
 * The question this answers is "is my barber in on Thursday", which customers
 * have always had to ring the shop to ask. Today first, then the next six days.
 */

interface Day {
  date: string;
  weekday: number;
  open: boolean;
  opensAt: number | null;
  closesAt: number | null;
  barbers: { id: string; name: string; photo: string | null }[];
}

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export default function RosterPage() {
  const { t, fmtDate } = useTranslation();
  const [days, setDays] = useState<Day[] | null>(null);

  useEffect(() => {
    fetch("/api/customer/roster")
      .then((r) => r.json())
      .then((d) => setDays(Array.isArray(d?.days) ? d.days : []))
      .catch(() => setDays([]));
  }, []);

  return (
    <div className="space-y-6">
      <ScreenTitle title={t("roster.title")} hint={t("roster.hint")} />

      {days === null ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : days.length === 0 ? (
        <EmptyState icon="calendar" title={t("roster.none")} hint={t("roster.noneHint")} />
      ) : (
        <div className="space-y-2">
          {days.map((day, index) => (
            <section key={day.date} className="c-card p-4">
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-sm font-medium text-ink">
                  {index === 0 ? t("roster.today") : fmtDate(day.date)}
                </div>
                <div className="text-xs text-soft">
                  {day.open && day.opensAt !== null && day.closesAt !== null
                    ? `${hhmm(day.opensAt)} – ${day.closesAt === 24 * 60 ? "00:00" : hhmm(day.closesAt)}`
                    : t("roster.closed")}
                </div>
              </div>

              {day.open && (
                <div className="mt-3">
                  {day.barbers.length === 0 ? (
                    <p className="text-xs text-faint">{t("roster.nobodyIn")}</p>
                  ) : (
                    <div className="scroll-clean flex gap-3 overflow-x-auto pb-1">
                      {day.barbers.map((barber) => (
                        <Link
                          key={barber.id}
                          href={`/app/barbers/${barber.id}`}
                          className="flex w-16 shrink-0 flex-col items-center gap-1.5"
                        >
                          <Avatar name={barber.name} photo={barber.photo} size={44} />
                          <span className="w-full truncate text-center text-[11px] text-soft">{barber.name}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
