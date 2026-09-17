"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Note } from "@/components/ui/Note";
import { useTranslation } from "@/lib/i18n";

/**
 * Time off, for whoever answers it.
 *
 * Approving is the moment the diary stops booking those days, so the answer
 * says what is already in the way rather than letting the shop find out on the
 * morning. Nothing is cancelled automatically: a customer's appointment is not
 * something to drop without a word.
 */

interface TimeOff {
  id: string;
  startAt: string;
  endAt: string;
  reason: string | null;
  status: "REQUESTED" | "APPROVED" | "DECLINED";
  decidedAt: string | null;
  barber: { id: string; name: string };
}

const TONE: Record<TimeOff["status"], "yellow" | "green" | "gray"> = {
  REQUESTED: "yellow",
  APPROVED: "green",
  DECLINED: "gray",
};

export default function TimeOffPage() {
  const { t, fmtDate } = useTranslation();
  const [rows, setRows] = useState<TimeOff[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(() => {
    fetch("/api/time-off")
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch(() => setRows([]));
  }, []);

  useEffect(load, [load]);

  const decide = async (row: TimeOff, approve: boolean) => {
    setBusyId(row.id);
    setMessage("");
    try {
      const res = await fetch(`/api/time-off/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve }),
      });
      const body = await res.json();
      if (res.ok && approve && body.bookingsInTheWay > 0) {
        setMessage(
          t("timeOff.inTheWay")
            .replace("{count}", String(body.bookingsInTheWay))
            .replace("{name}", row.barber.name)
        );
      }
      load();
    } finally {
      setBusyId(null);
    }
  };

  const waiting = (rows ?? []).filter((r) => r.status === "REQUESTED");
  const settled = (rows ?? []).filter((r) => r.status !== "REQUESTED");

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <PageHeader title={t("timeOff.shopTitle")} subtitle={t("timeOff.shopSubtitle")} />

      {message && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{message}</div>
      )}

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">{t("timeOff.waiting")}</h2>
        {waiting.length === 0 ? (
          <p className="text-sm text-gray-500">{t("timeOff.nothingWaiting")}</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {waiting.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900">{row.barber.name}</div>
                  <div className="text-xs text-gray-500">
                    {fmtDate(row.startAt)}
                    {row.reason ? ` · ${row.reason}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => decide(row, true)}
                    className="btn-primary text-xs"
                  >
                    {t("timeOff.approve")}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => decide(row, false)}
                    className="btn-secondary text-xs"
                  >
                    {t("timeOff.decline")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">{t("timeOff.settled")}</h2>
        {settled.length === 0 ? (
          <EmptyState icon="📅" title={t("timeOff.nothingSettled")} />
        ) : (
          <div className="divide-y divide-gray-100">
            {settled.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900">{row.barber.name}</div>
                  <div className="text-xs text-gray-500">{fmtDate(row.startAt)}</div>
                </div>
                <Badge variant={TONE[row.status]}>
                  {t(`timeOff.${row.status.toLowerCase()}` as "timeOff.approved")}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>

      <Note tone="info" title={t("timeOff.noteTitle")}>
        {t("timeOff.note")}
      </Note>
    </div>
  );
}
