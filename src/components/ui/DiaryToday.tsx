"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n";
import type { DiarySummary } from "@/lib/appointment-stats";

/**
 * The day's diary at a glance: who is still to come, who has been served, and
 * who never turned up. Shown on the owner's overview and in the day journal,
 * from one endpoint, so the two always say the same thing.
 */
export function DiaryToday({ date }: { date?: string }) {
  const { t, fmtCurrency } = useTranslation();
  const [data, setData] = useState<{ summary: DiarySummary; noShowRate: number } | null>(null);

  useEffect(() => {
    fetch(`/api/appointments/summary${date ? `?date=${date}` : ""}`)
      .then((r) => r.json())
      .then((d) => setData(d?.error ? null : d))
      .catch(() => setData(null));
  }, [date]);

  if (!data) return <div className="card h-28 animate-pulse bg-gray-100" />;
  const s = data.summary;

  if (s.total === 0 && s.cancelled === 0) {
    return (
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">{t("diary.title")}</h2>
        <p className="text-sm text-gray-400">{t("diary.nothing")}</p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900">{t("diary.title")}</h2>
        <Link href="/appointments" className="text-xs text-primary-700 hover:underline">
          {t("diary.openDiary")}
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Figure label={t("diary.stillToCome")} value={String(s.open)} hint={fmtCurrency(s.expectedTakings)} />
        <Figure label={t("diary.served")} value={String(s.completed)} hint={fmtCurrency(s.servedTakings)} tone="cash" />
        <Figure label={t("diary.walkIns")} value={String(s.walkIns)} hint={`${s.booked} ${t("diary.booked")}`} />
        <Figure
          label={t("diary.noShows")}
          value={String(s.noShows)}
          hint={s.noShows > 0 ? `${data.noShowRate}% · ${fmtCurrency(s.missedTakings)}` : t("diary.allTurnedUp")}
          tone={s.noShows > 0 ? "cost" : "plain"}
        />
      </div>

      {(s.unpaid > 0 || s.inChair > 0 || s.waiting > 0) && (
        <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
          {s.inChair > 0 && (
            <span>
              {t("queue.inChair")}: <strong className="text-gray-900">{s.inChair}</strong>
            </span>
          )}
          {s.waiting > 0 && (
            <span>
              {t("queue.waiting")}: <strong className="text-gray-900">{s.waiting}</strong>
            </span>
          )}
          {s.unpaid > 0 && (
            <span className="text-red-600">
              {t("diary.unpaid")}: <strong>{s.unpaid}</strong> · {fmtCurrency(s.unpaidTakings)}
            </span>
          )}
          {s.cancelled > 0 && (
            <span>
              {t("appointments.statusCancelled")}: <strong className="text-gray-900">{s.cancelled}</strong>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  hint,
  tone = "plain",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "plain" | "cash" | "cost";
}) {
  const toneClass = { plain: "text-gray-900", cash: "text-green-700", cost: "text-red-600" }[tone];
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${toneClass}`}>{value}</div>
      {hint && <div className="text-[11px] text-gray-400 mt-0.5">{hint}</div>}
    </div>
  );
}
