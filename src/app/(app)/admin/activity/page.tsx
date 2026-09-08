"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { format, startOfMonth, subDays } from "date-fns";
import { DateNavInput } from "@/components/ui/DateNavInput";
import { PageHeader } from "@/components/ui/PageHeader";
import { Note } from "@/components/ui/Note";
import { Badge } from "@/components/ui/Badge";
import { useTranslation } from "@/lib/i18n";
import type { TranslationKey } from "../../../../../messages/en";

type Action = "CREATE" | "UPDATE" | "DELETE";

interface AuditRow {
  id: string;
  at: string;
  userName: string;
  userRole: string;
  action: Action;
  entity: string;
  entityId: string | null;
  summary: string;
  amount: number | null;
  details: string | null;
}

interface Finding {
  sessionId: string;
  openedAt: string;
  openedBy: string;
  visitCount: number;
  highestNumber: number;
  missing: number[];
  repeated: number[];
}

const ENTITIES = [
  "VISIT",
  "EXPENSE",
  "ADVANCE",
  "PENALTY",
  "CASH_MOVEMENT",
  "DRAWER_SESSION",
  "PURCHASE",
  "SUPPLIER_PAYMENT",
  "STOCK_TRANSFER",
  "STOCK_COUNT",
  "USER",
] as const;

export default function ActivityPage() {
  const { t, fmtCurrency, fmtDate, fmtDateTime } = useTranslation();
  const today = format(new Date(), "yyyy-MM-dd");

  const [from, setFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [to, setTo] = useState(today);
  const [action, setAction] = useState<"" | Action>("");
  const [entity, setEntity] = useState("");

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  const [findings, setFindings] = useState<Finding[]>([]);
  const [deletedSessions, setDeletedSessions] = useState<{ day: string; visits: number; total: number }[]>([]);
  const [gapSummary, setGapSummary] = useState({
    removedVisits: 0,
    sessionsAffected: 0,
    repeatedNumbers: 0,
    orphanedVisits: 0,
  });

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      from: new Date(from).toISOString(),
      to: new Date(to + "T23:59:59").toISOString(),
      ...(action ? { action } : {}),
      ...(entity ? { entity } : {}),
    });
    const range = new URLSearchParams({
      from: new Date(from).toISOString(),
      to: new Date(to + "T23:59:59").toISOString(),
    });

    Promise.all([
      fetch(`/api/audit?${params}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/audit/removed-visits?${range}`).then((r) => r.json()).catch(() => null),
    ]).then(([audit, gaps]) => {
      setRows(audit && Array.isArray(audit.rows) ? audit.rows : []);
      setCounts(audit?.counts ?? {});
      setFindings(gaps && Array.isArray(gaps.findings) ? gaps.findings : []);
      setDeletedSessions(gaps && Array.isArray(gaps.deletedSessions) ? gaps.deletedSessions : []);
      setGapSummary(
        gaps?.summary ?? { removedVisits: 0, sessionsAffected: 0, repeatedNumbers: 0, orphanedVisits: 0 }
      );
      setLoading(false);
    });
  }, [from, to, action, entity]);

  useEffect(() => { load(); }, [load]);

  const actionBadge = (a: Action) => (
    <Badge variant={a === "DELETE" ? "red" : a === "UPDATE" ? "yellow" : "green"}>
      {a === "DELETE" ? t("activity.deleted") : a === "UPDATE" ? t("activity.edited") : t("activity.added")}
    </Badge>
  );

  const entityLabel = (e: string) => t(`activity.entity.${e}` as TranslationKey) || e;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <PageHeader title={t("activity.title")} subtitle={t("activity.subtitle")} />

      <Note tone="info" title={t("activity.noteTitle")} icon="list">
        {t("activity.noteBody")}
      </Note>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">{t("field.from")}</label>
          <DateNavInput value={from} onChange={setFrom} />
        </div>
        <div>
          <label className="label">{t("field.to")}</label>
          <DateNavInput value={to} onChange={setTo} />
        </div>
        <div>
          <label className="label">{t("activity.action")}</label>
          <select className="input" value={action} onChange={(e) => setAction(e.target.value as "" | Action)}>
            <option value="">{t("common.all")}</option>
            <option value="DELETE">{t("activity.deleted")}</option>
            <option value="UPDATE">{t("activity.edited")}</option>
            <option value="CREATE">{t("activity.added")}</option>
          </select>
        </div>
        <div>
          <label className="label">{t("activity.what")}</label>
          <select className="input" value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="">{t("common.all")}</option>
            {ENTITIES.map((e) => (
              <option key={e} value={e}>{entityLabel(e)}</option>
            ))}
          </select>
        </div>
        <button onClick={load} className="btn-primary">{t("action.filter")}</button>
      </div>

      {/* Counts */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4">
          <div className="text-xs text-gray-500">{t("activity.deletions")}</div>
          <div className={`text-xl font-bold tabular-nums ${(counts.DELETE ?? 0) > 0 ? "text-red-600" : "text-gray-900"}`}>
            {counts.DELETE ?? 0}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-500">{t("activity.edits")}</div>
          <div className="text-xl font-bold text-gray-900 tabular-nums">{counts.UPDATE ?? 0}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-500">{t("activity.additions")}</div>
          <div className="text-xl font-bold text-gray-900 tabular-nums">{counts.CREATE ?? 0}</div>
        </div>
      </div>

      {/* The trail */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <div key={i} className="card h-14 animate-pulse bg-gray-100" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="card p-8 text-center text-gray-400">
          <div className="text-3xl mb-2">🗂️</div>
          <div className="text-sm">{t("activity.empty")}</div>
          <div className="text-xs mt-1 text-gray-400">{t("activity.emptyHint")}</div>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("field.dateTime")}</th>
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("activity.who")}</th>
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("activity.action")}</th>
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("activity.what")}</th>
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("activity.detail")}</th>
                <th className="text-end px-4 py-3 font-medium text-gray-600">{t("field.amount")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <Fragment key={r.id}>
                  <tr
                    className={`hover:bg-gray-50 ${r.details ? "cursor-pointer" : ""} ${
                      r.action === "DELETE" ? "bg-red-50/40" : ""
                    }`}
                    onClick={() => r.details && setOpen(open === r.id ? null : r.id)}
                  >
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDateTime(r.at)}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">{r.userName}</span>
                      <span className="block text-xs text-gray-400">
                        {r.userRole === "OWNER" ? t("common.owner") : t("common.cashier")}
                      </span>
                    </td>
                    <td className="px-4 py-3">{actionBadge(r.action)}</td>
                    <td className="px-4 py-3 text-gray-700">{entityLabel(r.entity)}</td>
                    <td className="px-4 py-3 text-gray-900">{r.summary}</td>
                    <td className="px-4 py-3 text-end tabular-nums text-gray-900">
                      {r.amount !== null ? fmtCurrency(r.amount) : ""}
                    </td>
                  </tr>
                  {open === r.id && r.details && (
                    <tr className="bg-gray-50/70">
                      <td colSpan={6} className="px-6 py-3">
                        <pre className="text-[11px] text-gray-600 whitespace-pre-wrap break-all">
                          {(() => {
                            try {
                              return JSON.stringify(JSON.parse(r.details), null, 2);
                            } catch {
                              return r.details;
                            }
                          })()}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Removals from before the trail existed */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">{t("activity.pastTitle")}</h2>

        <Note tone="rule" title={t("activity.pastNoteTitle")} icon="receipt">
          {t("activity.pastNoteBody")}
        </Note>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="card p-4">
            <div className="text-xs text-gray-500">{t("activity.pastRemoved")}</div>
            <div className={`text-xl font-bold tabular-nums ${gapSummary.removedVisits > 0 ? "text-red-600" : "text-gray-900"}`}>
              {gapSummary.removedVisits}
            </div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-gray-500">{t("activity.pastSessions")}</div>
            <div className="text-xl font-bold text-gray-900 tabular-nums">{gapSummary.sessionsAffected}</div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-gray-500">{t("activity.pastRepeated")}</div>
            <div className="text-xl font-bold text-gray-900 tabular-nums">{gapSummary.repeatedNumbers}</div>
          </div>
        </div>

        {findings.length === 0 ? (
          <div className="card p-6 text-center text-sm text-gray-400">{t("activity.pastNone")}</div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="th-start px-4 py-3 font-medium text-gray-600">{t("field.date")}</th>
                  <th className="th-start px-4 py-3 font-medium text-gray-600">{t("cashDrawer.openedBy")}</th>
                  <th className="text-end px-4 py-3 font-medium text-gray-600">{t("common.visits")}</th>
                  <th className="th-start px-4 py-3 font-medium text-gray-600">{t("activity.missingNumbers")}</th>
                  <th className="th-start px-4 py-3 font-medium text-gray-600">{t("activity.repeatedNumbers")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {findings.map((f) => (
                  <tr key={f.sessionId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(f.openedAt)}</td>
                    <td className="px-4 py-3 text-gray-700">{f.openedBy}</td>
                    <td className="px-4 py-3 text-end text-gray-600 tabular-nums">
                      {f.visitCount} / {f.highestNumber}
                    </td>
                    <td className="px-4 py-3">
                      {f.missing.length > 0 ? (
                        <span className="font-semibold text-red-600 tabular-nums">
                          {f.missing.map((n) => `#${n}`).join(", ")}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 tabular-nums">
                      {f.repeated.length > 0 ? f.repeated.map((n) => `#${n}`).join(", ") : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {deletedSessions.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <span className="font-semibold text-gray-700 text-sm">{t("activity.deletedSessions")}</span>
              <span className="block text-xs text-gray-500 mt-0.5">{t("activity.deletedSessionsHint")}</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="th-start px-4 py-3 font-medium text-gray-600">{t("field.date")}</th>
                  <th className="text-end px-4 py-3 font-medium text-gray-600">{t("common.visits")}</th>
                  <th className="text-end px-4 py-3 font-medium text-gray-600">{t("field.total")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {deletedSessions.map((d) => (
                  <tr key={d.day} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">{fmtDate(d.day)}</td>
                    <td className="px-4 py-3 text-end tabular-nums text-gray-900">{d.visits}</td>
                    <td className="px-4 py-3 text-end tabular-nums text-gray-900">{fmtCurrency(d.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Note tone="warn" title={t("activity.limitTitle")} icon="shield">
          {t("activity.limitBody")}
        </Note>
      </div>
    </div>
  );
}
