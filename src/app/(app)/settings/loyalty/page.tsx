"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Note } from "@/components/ui/Note";
import { useTranslation } from "@/lib/i18n";

/**
 * The punch card the shop runs: how many visits, and what they win.
 *
 * Deliberately not a discount engine. The till mentions a full card while the
 * customer is standing there and the cashier decides what to charge, exactly as
 * they would for any other kindness — so the day's takings stay a record of what
 * actually happened.
 */
export default function LoyaltySettingsPage() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const [visits, setVisits] = useState("6");
  const [reward, setReward] = useState("");
  const [rewardAr, setRewardAr] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings/loyalty")
      .then((r) => r.json())
      .then((d) => {
        setEnabled(Boolean(d?.enabled));
        setVisits(String(d?.visitsRequired ?? 6));
        setReward(d?.rewardText ?? "");
        setRewardAr(d?.rewardTextAr ?? "");
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const count = parseInt(visits, 10);
    if (!Number.isFinite(count) || count < 1 || count > 100) {
      setError(t("loyalty.invalidVisits"));
      return;
    }
    if (!reward.trim()) {
      setError(t("loyalty.invalidReward"));
      return;
    }

    setError("");
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/settings/loyalty", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, visitsRequired: count, rewardText: reward.trim(), rewardTextAr: rewardAr.trim() }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        setError((await res.json())?.error ?? t("loyalty.invalidReward"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <PageHeader title={t("nav.loyalty")} subtitle={t("loyalty.subtitle")} />

      {loading ? (
        <div className="h-64 animate-pulse rounded-lg bg-gray-100" />
      ) : (
        <form onSubmit={save} className="card space-y-5 p-5">
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span className="text-sm font-medium text-gray-900">{t("loyalty.enabled")}</span>
          </label>

          <div>
            <label className="label">{t("loyalty.visitsRequired")}</label>
            <input
              className="input w-32"
              type="number"
              min={1}
              max={100}
              value={visits}
              onChange={(e) => setVisits(e.target.value)}
            />
          </div>

          <div>
            <label className="label">{t("loyalty.reward")}</label>
            <input className="input" value={reward} onChange={(e) => setReward(e.target.value)} maxLength={120} />
          </div>

          <div>
            <label className="label">{t("loyalty.rewardAr")}</label>
            <input className="input" dir="rtl" value={rewardAr} onChange={(e) => setRewardAr(e.target.value)} maxLength={120} />
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
            {t("loyalty.preview")
              .replace("{count}", visits || "6")
              .replace("{reward}", reward || "—")}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "…" : t("action.save")}
            </button>
            {saved && <span className="text-sm text-green-600">{t("booking.saved")}</span>}
          </div>
        </form>
      )}

      <Note tone="info" title={t("loyalty.noteTitle")}>
        {t("loyalty.note")}
      </Note>
    </div>
  );
}
