"use client";

import { useState } from "react";
import { useTranslation } from "@/lib/i18n";
import type { TranslationKey } from "../../../messages/en";

/**
 * "Something happened during that cut."
 *
 * A review is the customer's opinion, afterwards and in public. This is the
 * shop's own record, written by whoever was standing there: the clippers gave
 * out, the customer was unhappy with the fade, it ran forty minutes over.
 *
 * Deliberately one tap to open and two lines to fill, because a report that
 * takes a minute gets written at the end of the week, from memory, if at all.
 */

const KINDS = ["NOTE", "COMPLAINT", "EQUIPMENT", "INCIDENT"] as const;
type Kind = (typeof KINDS)[number];

const LABEL: Record<Kind, TranslationKey> = {
  NOTE: "cutReport.note",
  COMPLAINT: "cutReport.complaint",
  EQUIPMENT: "cutReport.equipment",
  INCIDENT: "cutReport.incident",
};

export function CutReport({ appointmentId }: { appointmentId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("NOTE");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const file = async () => {
    if (!body.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/reports/cuts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId, kind, body }),
      });
      if (res.ok) {
        setDone(true);
        setOpen(false);
        setBody("");
        return;
      }
      setError((await res.json())?.error ?? t("cutReport.failed"));
    } catch {
      setError(t("cutReport.failed"));
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return <p className="mt-3 text-center text-xs text-accent">{t("cutReport.filed")}</p>;
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="c-btn-ghost mt-3 w-full text-[10px]">
        {t("cutReport.open")}
      </button>
    );
  }

  return (
    <div className="mt-3 border-t border-hair pt-3">
      <div className="flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={`c-choice px-3 py-1.5 text-[11px] ${kind === k ? "c-choice-on" : ""}`}
          >
            {t(LABEL[k])}
          </button>
        ))}
      </div>

      <textarea
        className="c-input mt-2 min-h-[72px] resize-none"
        placeholder={t("cutReport.placeholder")}
        maxLength={1000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />

      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className="c-btn-secondary flex-1">
          {t("action.cancel")}
        </button>
        <button type="button" onClick={file} disabled={saving || !body.trim()} className="c-btn-primary flex-1">
          {saving ? "…" : t("cutReport.send")}
        </button>
      </div>

      {error && <p className="mt-2 text-center text-xs text-red-300">{error}</p>}
    </div>
  );
}
