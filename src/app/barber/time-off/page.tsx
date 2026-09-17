"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n";
import { EmptyState, Pill, ScreenTitle, SectionTitle, Skeleton } from "@/components/customer/kit";

/**
 * A barber asking for a day off, from the phone in their pocket.
 *
 * It says plainly that asking is not having: the diary keeps booking them until
 * the owner answers. A screen that implied otherwise would send somebody home
 * on a day they were expected.
 */

interface Request {
  id: string;
  startAt: string;
  endAt: string;
  reason: string | null;
  status: "REQUESTED" | "APPROVED" | "DECLINED";
  decidedAt: string | null;
}

const TONE: Record<Request["status"], "warn" | "good" | "muted"> = {
  REQUESTED: "warn",
  APPROVED: "good",
  DECLINED: "muted",
};

/** The shop's day, so a whole day off is one tap rather than two timestamps. */
const wholeDay = (dateISO: string) => ({
  startAt: new Date(`${dateISO}T00:00:00+03:00`).toISOString(),
  endAt: new Date(`${dateISO}T23:59:00+03:00`).toISOString(),
});

export default function BarberTimeOffPage() {
  const { t, fmtDate } = useTranslation();
  const [requests, setRequests] = useState<Request[] | null>(null);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    fetch("/api/barber/time-off")
      .then((r) => r.json())
      .then((d) => setRequests(Array.isArray(d) ? d : []))
      .catch(() => setRequests([]));
  }, []);

  useEffect(load, [load]);

  const askFor = async () => {
    if (!date) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/barber/time-off", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...wholeDay(date), reason }),
      });
      if (res.ok) {
        setDate("");
        setReason("");
        load();
      } else {
        setError((await res.json())?.error ?? t("timeOff.failed"));
      }
    } finally {
      setSaving(false);
    }
  };

  const withdraw = async (id: string) => {
    await fetch(`/api/barber/time-off?id=${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="space-y-6 pt-2">
      <ScreenTitle title={t("timeOff.title")} hint={t("timeOff.hint")} />

      <section className="c-card p-5">
        <div className="space-y-3">
          <div>
            <label className="c-label" htmlFor="timeoff-date">
              {t("timeOff.whichDay")}
            </label>
            <input
              id="timeoff-date"
              type="date"
              className="c-input"
              min={new Date().toISOString().slice(0, 10)}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className="c-label" htmlFor="timeoff-reason">
              {t("timeOff.why")}
            </label>
            <input
              id="timeoff-reason"
              className="c-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
              placeholder={t("timeOff.whyPlaceholder")}
            />
          </div>
          <button type="button" onClick={askFor} disabled={saving || !date} className="c-btn-primary w-full">
            {saving ? "…" : t("timeOff.ask")}
          </button>
          {error && <p className="text-center text-xs text-red-300">{error}</p>}
        </div>
      </section>

      <section>
        <SectionTitle>{t("timeOff.yours")}</SectionTitle>

        {requests === null ? (
          <Skeleton className="h-24" />
        ) : requests.length === 0 ? (
          <EmptyState icon="calendar" title={t("timeOff.noneYet")} hint={t("timeOff.noneYetHint")} />
        ) : (
          <div className="space-y-2">
            {requests.map((request) => (
              <div key={request.id} className="c-card flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink">{fmtDate(request.startAt)}</div>
                  {request.reason && <div className="truncate text-xs text-soft">{request.reason}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Pill tone={TONE[request.status]}>{t(`timeOff.${request.status.toLowerCase()}` as "timeOff.requested")}</Pill>
                  {request.status === "REQUESTED" && (
                    <button type="button" onClick={() => withdraw(request.id)} className="c-btn-ghost text-[10px]">
                      {t("timeOff.withdraw")}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
