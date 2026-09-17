"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n";

/**
 * What to send, where, and what to write on it.
 *
 * A customer who has been asked for a deposit needs three things at a glance:
 * the amount, the number, and the reference — and each is tappable to copy,
 * because retyping an InstaPay number from memory is how transfers go astray.
 */

export function DepositNotice({
  amount,
  reference,
}: {
  amount: number;
  reference: string | null;
}) {
  const { t, fmtCurrency } = useTranslation();
  const [instapay, setInstapay] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/deposits")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setInstapay(d?.instapay ?? null))
      .catch(() => setInstapay(null));
  }, []);

  const copy = async (what: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard refused: the value is on screen to read anyway.
    }
  };

  return (
    <div className="c-card-raised animate-fade-up p-5">
      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-accent">
        {t("app.depositNeeded").replace("{amount}", fmtCurrency(amount))}
      </div>

      {instapay && (
        <button
          type="button"
          onClick={() => copy("number", instapay)}
          className="mt-4 w-full border border-hair bg-surface px-4 py-3 text-start transition-colors hover:border-accent"
        >
          <div className="text-[10px] uppercase tracking-[0.18em] text-faint">{t("app.depositTo")}</div>
          <div className="c-display mt-1 text-xl tabular-nums text-ink">{instapay}</div>
          {copied === "number" && <div className="mt-1 text-[11px] text-accent">{t("app.referralCopied")}</div>}
        </button>
      )}

      {reference && (
        <button
          type="button"
          onClick={() => copy("ref", reference)}
          className="mt-2 w-full border border-dashed border-accent bg-accent-soft px-4 py-3 text-start"
        >
          <div className="text-[10px] uppercase tracking-[0.18em] text-faint">{t("app.depositRef")}</div>
          <div className="mt-1 text-lg font-bold tracking-[0.2em] text-accent">{reference}</div>
          {copied === "ref" && <div className="mt-1 text-[11px] text-accent">{t("app.referralCopied")}</div>}
        </button>
      )}

      <p className="mt-3 text-sm text-mid">{t("app.depositHold")}</p>
    </div>
  );
}
