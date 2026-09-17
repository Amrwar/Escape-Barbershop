"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Note } from "@/components/ui/Note";
import { Modal } from "@/components/ui/Modal";
import { useTranslation } from "@/lib/i18n";
import type { TranslationKey } from "../../../../../messages/en";
import { SEGMENT_KEYS, type SegmentKey } from "@/lib/segments";

/**
 * Groups of customers, and what the shop can do with one.
 *
 * A group is worked out from the visits every time it is opened, so it is never
 * a stale mailing list. The shop can read it, ring the numbers, or — for the
 * ones who have the app — send a notification, which is the only free way to
 * reach anybody.
 */

interface Birthday {
  id: string;
  name: string;
  phone: string | null;
  daysAway: number;
}

interface Member {
  id: string;
  name: string;
  phone: string | null;
  visits: number;
  spend: number;
  lastVisitAt: string;
  hasApp: boolean;
}

const LABEL: Record<SegmentKey, TranslationKey> = {
  newcomers: "segments.newcomers",
  regulars: "segments.regulars",
  slipping: "segments.slipping",
  lapsed: "segments.lapsed",
  bigSpenders: "segments.bigSpenders",
  oneVisitOnly: "segments.oneVisitOnly",
};

const HINT: Record<SegmentKey, TranslationKey> = {
  newcomers: "segments.newcomersHint",
  regulars: "segments.regularsHint",
  slipping: "segments.slippingHint",
  lapsed: "segments.lapsedHint",
  bigSpenders: "segments.bigSpendersHint",
  oneVisitOnly: "segments.oneVisitOnlyHint",
};

export default function SegmentsPage() {
  const { t, fmtCurrency, fmtDate } = useTranslation();
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [key, setKey] = useState<SegmentKey>("slipping");
  const [group, setGroup] = useState<{ total: number; reachable: number; members: Member[] } | null>(null);
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);

  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/segments")
      .then((r) => r.json())
      .then((d) => setCounts(d?.counts ?? null))
      .catch(() => setCounts(null));

    fetch("/api/birthdays?days=30")
      .then((r) => r.json())
      .then((d) => setBirthdays(Array.isArray(d?.birthdays) ? d.birthdays : []))
      .catch(() => setBirthdays([]));
  }, []);

  const loadGroup = useCallback(() => {
    setGroup(null);
    fetch(`/api/segments/${key}`)
      .then((r) => r.json())
      .then((d) => setGroup(d?.members ? d : { total: 0, reachable: 0, members: [] }))
      .catch(() => setGroup({ total: 0, reachable: 0, members: [] }));
  }, [key]);

  useEffect(loadGroup, [loadGroup]);

  const send = async () => {
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/segments/${key}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body: message }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? t("segments.sendFailed"));
        return;
      }
      setResult(t("segments.sent").replace("{count}", String(data.delivered)).replace("{people}", String(data.recipients)));
      setComposing(false);
      setTitle("");
      setMessage("");
    } catch {
      setError(t("segments.sendFailed"));
    } finally {
      setSending(false);
    }
  };

  const phones = (group?.members ?? []).map((m) => m.phone).filter(Boolean).join(", ");

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title={t("segments.title")}
        subtitle={t("segments.subtitle")}
        action={
          <Link href="/customers" className="btn-secondary">
            {t("nav.customers")}
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {SEGMENT_KEYS.map((segment) => (
          <button
            key={segment}
            type="button"
            onClick={() => setKey(segment)}
            className={`rounded-xl border p-4 text-start transition-colors ${
              key === segment ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <div className="text-xs text-gray-500">{t(LABEL[segment])}</div>
            <div className="mt-0.5 text-xl font-bold tabular-nums text-gray-900">{counts?.[segment] ?? "—"}</div>
          </button>
        ))}
      </div>

      <div className="card p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{t(LABEL[key])}</h2>
            <p className="mt-0.5 text-xs text-gray-500">{t(HINT[key])}</p>
          </div>
          {group && group.reachable > 0 && (
            <button type="button" onClick={() => setComposing(true)} className="btn-primary text-xs">
              {t("segments.notify").replace("{count}", String(group.reachable))}
            </button>
          )}
        </div>

        {result && <p className="mb-3 text-sm text-green-600">{result}</p>}

        {!group ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-gray-100" />
            ))}
          </div>
        ) : group.members.length === 0 ? (
          <p className="text-sm text-gray-500">{t("segments.nobody")}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs text-gray-500">
                    <th className="py-2 text-start font-medium">{t("field.name")}</th>
                    <th className="py-2 text-start font-medium">{t("field.phone")}</th>
                    <th className="py-2 text-end font-medium">{t("insights.visits")}</th>
                    <th className="py-2 text-end font-medium">{t("customers.totalSpent")}</th>
                    <th className="py-2 text-end font-medium">{t("segments.lastSeen")}</th>
                  </tr>
                </thead>
                <tbody>
                  {group.members.map((member) => (
                    <tr key={member.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-2">
                        <Link href={`/customers/${member.id}`} className="font-medium text-gray-900 hover:underline">
                          {member.name}
                        </Link>
                        {member.hasApp && (
                          <span className="ms-2 rounded-full bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                            {t("segments.hasApp")}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-gray-600">{member.phone ?? "—"}</td>
                      <td className="py-2 text-end tabular-nums text-gray-600">{member.visits}</td>
                      <td className="py-2 text-end tabular-nums text-gray-900">{fmtCurrency(member.spend)}</td>
                      <td className="py-2 text-end text-xs text-gray-500">{fmtDate(member.lastVisitAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {phones && (
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(phones)}
                className="btn-secondary mt-4 text-xs"
              >
                {t("segments.copyPhones")}
              </button>
            )}
          </>
        )}
      </div>

      <div className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">{t("birthdays.thisMonth")}</h2>
        {birthdays.length === 0 ? (
          <p className="text-sm text-gray-500">{t("birthdays.none")}</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {birthdays.map((person) => (
              <div key={person.id} className="flex items-center justify-between py-2 text-sm">
                <Link href={`/customers/${person.id}`} className="font-medium text-gray-900 hover:underline">
                  {person.name}
                </Link>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-gray-400">{person.phone ?? "—"}</span>
                  <span className={`text-xs ${person.daysAway === 0 ? "font-semibold text-amber-600" : "text-gray-500"}`}>
                    {person.daysAway === 0
                      ? t("birthdays.today")
                      : t("birthdays.inDays").replace("{days}", String(person.daysAway))}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Note tone="info" title={t("segments.noteTitle")}>
        {t("segments.note")}
      </Note>

      <Modal open={composing} onClose={() => setComposing(false)} title={t("segments.compose")}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {t("segments.composeHint").replace("{count}", String(group?.reachable ?? 0))}
          </p>
          <div>
            <label className="label">{t("segments.messageTitle")}</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} />
          </div>
          <div>
            <label className="label">{t("segments.messageBody")}</label>
            <textarea
              className="input min-h-[80px]"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={160}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setComposing(false)} className="btn-secondary">
              {t("action.cancel")}
            </button>
            <button type="button" onClick={send} disabled={sending || !title.trim() || !message.trim()} className="btn-primary">
              {sending ? "…" : t("segments.send")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
