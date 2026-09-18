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
 *
 * It appears on two screens with two different looks — the barber's phone,
 * which is the dark token palette, and the till, which is the shop's white
 * chrome — so the styling is a prop rather than a second copy of the form.
 */

const KINDS = ["NOTE", "COMPLAINT", "EQUIPMENT", "INCIDENT"] as const;
type Kind = (typeof KINDS)[number];

const LABEL: Record<Kind, TranslationKey> = {
  NOTE: "cutReport.note",
  COMPLAINT: "cutReport.complaint",
  EQUIPMENT: "cutReport.equipment",
  INCIDENT: "cutReport.incident",
};

const SKIN = {
  app: {
    rule: "border-t border-hair",
    open: "c-btn-ghost w-full text-[10px]",
    choice: (on: boolean) => `c-choice px-3 py-1.5 text-[11px] ${on ? "c-choice-on" : ""}`,
    input: "c-input mt-2 min-h-[72px] resize-none",
    cancel: "c-btn-secondary flex-1",
    send: "c-btn-primary flex-1",
    filed: "text-accent",
    error: "text-bad",
  },
  shop: {
    rule: "border-t border-gray-200",
    open: "w-full rounded-lg border border-gray-300 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50",
    choice: (on: boolean) =>
      `rounded-full px-3 py-1.5 text-xs font-medium border ${
        on ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 text-gray-600 hover:bg-gray-50"
      }`,
    input: "input mt-2 min-h-[72px] resize-none",
    cancel: "btn-secondary flex-1",
    send: "btn-primary flex-1",
    filed: "text-green-600",
    error: "text-red-600",
  },
} as const;

/**
 * The cut is named one way or the other: a booked cut is an appointment, a
 * walk-in is a visit. Whichever the screen has, it passes.
 */
type Cut = { appointmentId: string; visitId?: never } | { visitId: string; appointmentId?: never };

export function CutReport({ tone = "app", ...cut }: Cut & { tone?: keyof typeof SKIN }) {
  const { t } = useTranslation();
  const skin = SKIN[tone];
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
        body: JSON.stringify({ ...cut, kind, body }),
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
    return <p className={`mt-3 text-center text-xs ${skin.filed}`}>{t("cutReport.filed")}</p>;
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`mt-3 ${skin.open}`}>
        {t("cutReport.open")}
      </button>
    );
  }

  return (
    <div className={`mt-3 pt-3 ${skin.rule}`}>
      <div className="flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={skin.choice(kind === k)}
          >
            {t(LABEL[k])}
          </button>
        ))}
      </div>

      <textarea
        className={skin.input}
        placeholder={t("cutReport.placeholder")}
        maxLength={1000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />

      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className={skin.cancel}>
          {t("action.cancel")}
        </button>
        <button type="button" onClick={file} disabled={saving || !body.trim()} className={skin.send}>
          {saving ? "…" : t("cutReport.send")}
        </button>
      </div>

      {error && <p className={`mt-2 text-center text-xs ${skin.error}`}>{error}</p>}
    </div>
  );
}
