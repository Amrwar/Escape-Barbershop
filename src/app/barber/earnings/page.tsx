"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n";
import { ScreenTitle, SectionTitle, Skeleton } from "@/components/customer/kit";

/**
 * What a barber has earned: their commission and tips this week and this month,
 * worked out exactly as the payroll sheet does. Advances and penalties are not
 * here on purpose — those belong to the payroll conversation with the owner.
 */

interface Period {
  visitCount: number;
  visitTotal: number;
  commissionableTotal: number;
  commission: number;
  tips: number;
  noShows?: number;
  from?: string;
}

interface Earnings {
  week: Period;
  month: Period;
  commissionRule: { type: "PERCENT" | "FIXED_PER_VISIT"; value: number } | null;
  days: { date: string; takings: number; visits: number }[];
}

export default function BarberEarningsPage() {
  const { t, fmtCurrency, fmtDate, lang } = useTranslation();
  const [data, setData] = useState<Earnings | null>(null);

  useEffect(() => {
    fetch("/api/barber/earnings")
      .then((r) => r.json())
      .then((d) => setData(d?.error ? null : d))
      .catch(() => setData(null));
  }, []);

  if (!data) {
    return (
      <div className="space-y-3 pt-4">
        <Skeleton className="h-36" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const busiest = Math.max(1, ...data.days.map((d) => d.takings));

  return (
    <div className="space-y-6">
      <ScreenTitle title={t("barberApp.earnings")} hint={t("barberApp.earningsHint")} />

      <section className="c-card-raised animate-fade-up p-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-soft">{t("barberApp.thisWeek")}</div>
        <div className="c-display mt-2 text-4xl tabular-nums text-accent">
          {fmtCurrency(data.week.commission + data.week.tips)}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-hair pt-4 text-center">
          <Figure label={t("barberApp.commission")} value={fmtCurrency(data.week.commission)} />
          <Figure label={t("barberApp.tips")} value={fmtCurrency(data.week.tips)} />
          <Figure label={t("common.visits")} value={String(data.week.visitCount)} />
        </div>
        {data.commissionRule && (
          <p className="mt-4 text-center text-[11px] text-faint">
            {data.commissionRule.type === "PERCENT"
              ? t("barberApp.rulePercent").replace("{value}", String(data.commissionRule.value))
              : t("barberApp.rulePerVisit").replace("{value}", String(data.commissionRule.value))}
          </p>
        )}
      </section>

      {data.days.length > 0 && (
        <section>
          <SectionTitle>{t("barberApp.dayByDay")}</SectionTitle>
          <div className="c-card space-y-3 p-5">
            {data.days.map((d) => (
              <div key={d.date} className="flex items-center gap-3">
                <div className="w-16 shrink-0 text-xs text-soft">
                  {new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-GB", {
                    weekday: "short",
                    timeZone: "Africa/Cairo",
                  }).format(new Date(`${d.date}T12:00:00`))}
                </div>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
                  <div
                    className="h-full rounded-full bg-gradient-to-r to-accent to-accent transition-all duration-500"
                    style={{ width: `${Math.max(6, (d.takings / busiest) * 100)}%` }}
                  />
                </div>
                <div className="w-20 shrink-0 text-end text-xs tabular-nums text-mid">{fmtCurrency(d.takings)}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle>{t("barberApp.thisMonth")}</SectionTitle>
        <div className="c-card divide-y divide-hair">
          <Row label={t("barberApp.commission")} value={fmtCurrency(data.month.commission)} strong />
          <Row label={t("barberApp.tips")} value={fmtCurrency(data.month.tips)} />
          <Row label={t("barberApp.workDone")} value={fmtCurrency(data.month.visitTotal)} />
          <Row label={t("common.visits")} value={String(data.month.visitCount)} />
          {(data.month.noShows ?? 0) > 0 && <Row label={t("appointments.statusNoShow")} value={String(data.month.noShows)} tone="bad" />}
        </div>
        <p className="mt-3 text-center text-[11px] text-faint">{t("barberApp.payrollNote")}</p>
      </section>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm font-semibold tabular-nums text-ink">{value}</div>
      <div className="mt-0.5 text-[11px] text-soft">{label}</div>
    </div>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "bad" }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5">
      <span className="text-sm text-mid">{label}</span>
      <span
        className={`tabular-nums ${strong ? "text-base font-semibold text-accent" : tone === "bad" ? "text-sm text-bad" : "text-sm text-ink"}`}
      >
        {value}
      </span>
    </div>
  );
}
