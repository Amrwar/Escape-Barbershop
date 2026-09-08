"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/lib/i18n";

export default function FinanceSettingsPage() {
  const { t } = useTranslation();
  const [percent, setPercent] = useState("0");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings/finance")
      .then((r) => r.json())
      .then((d) => setPercent(String(d.visaCommissionPercent ?? 0)))
      .finally(() => setLoading(false));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const pct = parseFloat(percent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setError(t("finance.invalidPercent"));
      return;
    }
    setError("");
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/settings/finance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visaCommissionPercent: pct }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        setError(t("finance.invalidPercent"));
      }
    } finally {
      setSaving(false);
    }
  };

  const sample = 1000;
  const pct = parseFloat(percent) || 0;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <PageHeader
        title={t("finance.title")}
        subtitle={t("finance.subtitle")}
        action={
          <Link href="/settings/receipt" className="btn-secondary">
            {t("settings.receipt.title")}
          </Link>
        }
      />

      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">{t("finance.visaCommission")}</h2>

        {loading ? (
          <div className="h-10 bg-gray-100 animate-pulse rounded-lg" />
        ) : (
          <form onSubmit={save} className="space-y-4">
            <div>
              <label className="label">{t("finance.visaCommissionPercent")}</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                className="input max-w-40"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-2">{t("finance.visaCommissionHint")}</p>
            </div>

            {/* A worked example, so the rate is never entered blind */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm space-y-1">
              <div className="flex justify-between text-gray-600">
                <span>{t("common.card")}</span>
                <span>{sample.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-red-600">
                <span>{t("finance.visaCommission")} ({pct}%)</span>
                <span>-{((sample * pct) / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-200 pt-1">
                <span>{t("finance.cardNet")}</span>
                <span>{(sample - (sample * pct) / 100).toFixed(2)}</span>
              </div>
            </div>

            {error && <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>}

            <div className="flex items-center gap-3">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? t("action.saving") : t("action.save")}
              </button>
              {saved && <span className="text-sm text-green-600">{t("finance.saved")}</span>}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
