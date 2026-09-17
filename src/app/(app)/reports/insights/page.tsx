"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Note } from "@/components/ui/Note";
import { useTranslation } from "@/lib/i18n";

/**
 * The shop, read from its own takings: when it is busy, who is doing the work,
 * how many faces are new, and whether people come back.
 *
 * Every number here comes from paid visits — the same rows the money is made of
 * — so nothing on this screen can disagree with the day journal.
 */

interface Bucket {
  key: number;
  visits: number;
  takings: number;
}

interface Insights {
  visits: number;
  takings: number;
  newVersusReturning: { fresh: number; returning: number; freshPercent: number };
  weekdays: Bucket[];
  hours: Bucket[];
  barbers: { barberId: string; name: string; visits: number; takings: number; average: number; share: number }[];
  retention: {
    customers: number;
    repeatCustomers: number;
    repeatPercent: number;
    medianGapDays: number | null;
    slippingCount: number;
    slipping: { id: string; name: string; phone: string | null }[];
  };
}

const WEEKDAY_KEYS = [
  "booking.sunday",
  "booking.monday",
  "booking.tuesday",
  "booking.wednesday",
  "booking.thursday",
  "booking.friday",
  "booking.saturday",
] as const;

/** A bar as wide as its share of the busiest one. */
function Bar({ value, best, label, right }: { value: number; best: number; label: string; right: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-xs text-gray-500">{label}</span>
      <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
        <span
          className="block h-full rounded-full bg-amber-400"
          style={{ width: `${best > 0 ? Math.round((value / best) * 100) : 0}%` }}
        />
      </span>
      <span className="w-16 shrink-0 text-end text-xs tabular-nums text-gray-600">{right}</span>
    </div>
  );
}

export default function InsightsPage() {
  const { t, fmtCurrency } = useTranslation();
  const [days, setDays] = useState(90);
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 86_400_000);
    setData(null);
    fetch(`/api/reports/insights?from=${from.toISOString()}&to=${to.toISOString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then(setData)
      .catch(() => setError(t("insights.failed")));
  }, [days, t]);

  useEffect(load, [load]);

  const busiestDay = Math.max(1, ...(data?.weekdays ?? []).map((d) => d.visits));
  const openHours = (data?.hours ?? []).filter((h) => h.visits > 0);
  const busiestHour = Math.max(1, ...openHours.map((h) => h.visits));

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title={t("insights.title")}
        subtitle={t("insights.subtitle")}
        action={
          <Link href="/reports" className="btn-secondary">
            {t("nav.reports")}
          </Link>
        }
      />

      <div className="flex gap-2">
        {[30, 90, 365].map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setDays(option)}
            className={days === option ? "btn-primary text-xs" : "btn-secondary text-xs"}
          >
            {t("insights.lastDays").replace("{days}", String(option))}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!data ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="card p-4">
              <p className="text-xs text-gray-500">{t("insights.visits")}</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-gray-900">{data.visits}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-500">{t("insights.takings")}</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-gray-900">{fmtCurrency(data.takings)}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-500">{t("insights.newFaces")}</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-gray-900">
                {data.newVersusReturning.fresh}
                <span className="ms-1 text-sm font-medium text-gray-400">({data.newVersusReturning.freshPercent}%)</span>
              </p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-500">{t("insights.comeBack")}</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-gray-900">{data.retention.repeatPercent}%</p>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">{t("insights.busiestDays")}</h2>
            <div className="space-y-2">
              {data.weekdays.map((day) => (
                <Bar
                  key={day.key}
                  value={day.visits}
                  best={busiestDay}
                  label={t(WEEKDAY_KEYS[day.key])}
                  right={String(day.visits)}
                />
              ))}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">{t("insights.busiestHours")}</h2>
            {openHours.length === 0 ? (
              <p className="text-sm text-gray-500">{t("insights.nothingYet")}</p>
            ) : (
              <div className="space-y-2">
                {openHours.map((hour) => (
                  <Bar
                    key={hour.key}
                    value={hour.visits}
                    best={busiestHour}
                    label={`${String(hour.key).padStart(2, "0")}:00`}
                    right={String(hour.visits)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="card p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">{t("insights.byBarber")}</h2>
            {data.barbers.length === 0 ? (
              <p className="text-sm text-gray-500">{t("insights.nothingYet")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs text-gray-500">
                      <th className="py-2 text-start font-medium">{t("field.barber")}</th>
                      <th className="py-2 text-end font-medium">{t("insights.visits")}</th>
                      <th className="py-2 text-end font-medium">{t("insights.takings")}</th>
                      <th className="py-2 text-end font-medium">{t("insights.perVisit")}</th>
                      <th className="py-2 text-end font-medium">{t("insights.share")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.barbers.map((barber) => (
                      <tr key={barber.barberId} className="border-b border-gray-100 last:border-0">
                        <td className="py-2 font-medium text-gray-900">{barber.name}</td>
                        <td className="py-2 text-end tabular-nums text-gray-600">{barber.visits}</td>
                        <td className="py-2 text-end tabular-nums text-gray-900">{fmtCurrency(barber.takings)}</td>
                        <td className="py-2 text-end tabular-nums text-gray-600">{fmtCurrency(barber.average)}</td>
                        <td className="py-2 text-end tabular-nums text-gray-600">{barber.share}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card p-5">
            <h2 className="mb-1 text-sm font-semibold text-gray-900">{t("insights.retention")}</h2>
            <p className="mb-4 text-xs text-gray-500">
              {t("insights.retentionHint")
                .replace("{repeat}", String(data.retention.repeatCustomers))
                .replace("{customers}", String(data.retention.customers))
                .replace("{gap}", data.retention.medianGapDays === null ? "—" : String(data.retention.medianGapDays))}
            </p>

            {data.retention.slipping.length === 0 ? (
              <p className="text-sm text-gray-500">{t("insights.nobodySlipping")}</p>
            ) : (
              <>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t("insights.slipping").replace("{count}", String(data.retention.slippingCount))}
                </h3>
                <div className="divide-y divide-gray-100">
                  {data.retention.slipping.map((customer) => (
                    <Link
                      key={customer.id}
                      href={`/customers/${customer.id}`}
                      className="flex items-center justify-between py-2 text-sm hover:bg-gray-50"
                    >
                      <span className="font-medium text-gray-900">{customer.name}</span>
                      <span className="text-xs text-gray-400">{customer.phone ?? "—"}</span>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>

          <Note tone="info" title={t("insights.noteTitle")}>
            {t("insights.note")}
          </Note>
        </>
      )}
    </div>
  );
}
