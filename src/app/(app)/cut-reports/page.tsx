"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { useTranslation } from "@/lib/i18n";
import type { TranslationKey } from "../../../../messages/en";

/**
 * What the barbers said happened.
 *
 * Unread first and marked as such, because the whole value of this screen is in
 * being worked through — a list nobody clears is a list nobody reads. Each one
 * links to the customer it happened to, since that is almost always the next
 * question.
 */

type Kind = "NOTE" | "COMPLAINT" | "EQUIPMENT" | "INCIDENT";

/** Either side of the same thing: a booked cut, or one that walked in. */
interface Cut {
  id: string;
  customer: { id: string; name: string } | null;
  barber: { name: string } | null;
}

interface Report {
  id: string;
  kind: Kind;
  body: string;
  authorName: string;
  seenAt: string | null;
  createdAt: string;
  appointment: (Cut & { startAt: string }) | null;
  visit: (Cut & { visitAt: string }) | null;
}

const TONE: Record<Kind, "gray" | "yellow" | "blue" | "red"> = {
  NOTE: "gray",
  COMPLAINT: "yellow",
  EQUIPMENT: "blue",
  INCIDENT: "red",
};

const LABEL: Record<Kind, TranslationKey> = {
  NOTE: "cutReport.note",
  COMPLAINT: "cutReport.complaint",
  EQUIPMENT: "cutReport.equipment",
  INCIDENT: "cutReport.incident",
};

export default function CutReportsPage() {
  const { t, fmtDateTime } = useTranslation();
  const [reports, setReports] = useState<Report[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/reports/cuts")
      .then((r) => r.json())
      .then((d) => setReports(Array.isArray(d) ? d : []))
      .catch(() => setReports([]));
  }, []);

  useEffect(load, [load]);

  const markSeen = async (id: string) => {
    setBusyId(id);
    try {
      await fetch(`/api/reports/cuts?id=${id}`, { method: "PATCH" });
      load();
    } finally {
      setBusyId(null);
    }
  };

  const unread = (reports ?? []).filter((r) => !r.seenAt);
  const read = (reports ?? []).filter((r) => r.seenAt);

  const card = (report: Report, faded: boolean) => {
    const cut = report.appointment ?? report.visit;

    return (
    <div
      key={report.id}
      className={`rounded-xl border p-4 ${faded ? "border-gray-200 bg-gray-50" : "border-gray-200 bg-white"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={TONE[report.kind]}>{t(LABEL[report.kind])}</Badge>
            {cut?.customer && (
              <Link
                href={`/customers/${cut.customer.id}`}
                className="text-sm font-semibold text-gray-900 hover:underline"
              >
                {cut.customer.name}
              </Link>
            )}
            {report.visit && (
              <Link href={`/visits/${report.visit.id}`} className="text-xs text-gray-500 hover:underline">
                {t("cutReport.openVisit")}
              </Link>
            )}
          </div>

          <p className={`mt-2 whitespace-pre-line text-sm ${faded ? "text-gray-500" : "text-gray-700"}`}>
            {report.body}
          </p>

          <p className="mt-2 text-xs text-gray-400">
            {report.authorName}
            {cut?.barber ? ` · ${cut.barber.name}` : ""} · {fmtDateTime(report.createdAt)}
          </p>
        </div>

        {!report.seenAt && (
          <button
            type="button"
            disabled={busyId === report.id}
            onClick={() => markSeen(report.id)}
            className="flex-shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {t("cutReport.markSeen")}
          </button>
        )}
      </div>
    </div>
    );
  };

  return (
    <div>
      <PageHeader title={t("nav.cutReports")} subtitle={t("cutReport.subtitle")} />

      {reports === null ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <EmptyState icon="📋" title={t("cutReport.none")} description={t("cutReport.noneHint")} />
      ) : (
        <div className="space-y-6">
          {unread.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-900">
                {t("cutReport.unread")} ({unread.length})
              </h2>
              {unread.map((r) => card(r, false))}
            </section>
          )}

          {read.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-500">{t("cutReport.allRead")}</h2>
              {read.map((r) => card(r, true))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
