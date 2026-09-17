"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Note } from "@/components/ui/Note";
import { useTranslation } from "@/lib/i18n";

/**
 * The three ways the shop gives something back: the punch card, telling a
 * friend, and birthdays.
 *
 * None of them touches a price. Each is a note at the till or a message on a
 * phone; the cashier decides what to charge, which is what keeps the takings a
 * record of what actually happened.
 */

interface Rewards {
  loyalty: { enabled: boolean; visitsRequired: number; rewardText: string; rewardTextAr: string | null };
  referral: { enabled: boolean; rewardText: string; rewardTextAr: string | null };
  birthday: { enabled: boolean; messageText: string | null; messageTextAr: string | null };
}

export default function RewardsSettingsPage() {
  const { t } = useTranslation();
  const [rewards, setRewards] = useState<Rewards | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings/rewards")
      .then((r) => r.json())
      .then((d) => setRewards(d?.loyalty ? d : null))
      .catch(() => setRewards(null));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rewards) return;

    setError("");
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/settings/rewards", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rewards),
      });
      const data = await res.json();
      if (res.ok) {
        setRewards(data);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        setError(data?.error ?? t("rewards.saveFailed"));
      }
    } finally {
      setSaving(false);
    }
  };

  if (!rewards) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="h-96 animate-pulse rounded-lg bg-gray-100" />
      </div>
    );
  }

  const set = <K extends keyof Rewards>(section: K, patch: Partial<Rewards[K]>) =>
    setRewards({ ...rewards, [section]: { ...rewards[section], ...patch } });

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <PageHeader title={t("rewards.title")} subtitle={t("rewards.subtitle")} />

      <form onSubmit={save} className="space-y-6">
        <section className="card space-y-4 p-5">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={rewards.loyalty.enabled}
              onChange={(e) => set("loyalty", { enabled: e.target.checked })}
            />
            <span className="text-sm font-semibold text-gray-900">{t("loyalty.enabled")}</span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">{t("loyalty.visitsRequired")}</label>
              <input
                className="input"
                type="number"
                min={1}
                max={100}
                value={rewards.loyalty.visitsRequired}
                onChange={(e) => set("loyalty", { visitsRequired: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">{t("loyalty.reward")}</label>
              <input
                className="input"
                value={rewards.loyalty.rewardText}
                onChange={(e) => set("loyalty", { rewardText: e.target.value })}
                maxLength={120}
              />
            </div>
          </div>
          <div>
            <label className="label">{t("loyalty.rewardAr")}</label>
            <input
              className="input"
              dir="rtl"
              value={rewards.loyalty.rewardTextAr ?? ""}
              onChange={(e) => set("loyalty", { rewardTextAr: e.target.value })}
              maxLength={120}
            />
          </div>
          <p className="text-xs text-gray-500">
            {t("loyalty.preview")
              .replace("{count}", String(rewards.loyalty.visitsRequired))
              .replace("{reward}", rewards.loyalty.rewardText || "—")}
          </p>
        </section>

        <section className="card space-y-4 p-5">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={rewards.referral.enabled}
              onChange={(e) => set("referral", { enabled: e.target.checked })}
            />
            <span className="text-sm font-semibold text-gray-900">{t("referrals.enabled")}</span>
          </label>

          <div>
            <label className="label">{t("referrals.reward")}</label>
            <input
              className="input"
              value={rewards.referral.rewardText}
              onChange={(e) => set("referral", { rewardText: e.target.value })}
              maxLength={120}
            />
          </div>
          <div>
            <label className="label">{t("referrals.rewardAr")}</label>
            <input
              className="input"
              dir="rtl"
              value={rewards.referral.rewardTextAr ?? ""}
              onChange={(e) => set("referral", { rewardTextAr: e.target.value })}
              maxLength={120}
            />
          </div>
          <p className="text-xs text-gray-500">{t("referrals.hint")}</p>
        </section>

        <section className="card space-y-4 p-5">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={rewards.birthday.enabled}
              onChange={(e) => set("birthday", { enabled: e.target.checked })}
            />
            <span className="text-sm font-semibold text-gray-900">{t("birthdays.enabled")}</span>
          </label>

          <div>
            <label className="label">{t("birthdays.message")}</label>
            <input
              className="input"
              value={rewards.birthday.messageText ?? ""}
              onChange={(e) => set("birthday", { messageText: e.target.value })}
              maxLength={160}
              placeholder={t("birthdays.messagePlaceholder")}
            />
          </div>
          <div>
            <label className="label">{t("birthdays.messageAr")}</label>
            <input
              className="input"
              dir="rtl"
              value={rewards.birthday.messageTextAr ?? ""}
              onChange={(e) => set("birthday", { messageTextAr: e.target.value })}
              maxLength={160}
            />
          </div>
          <p className="text-xs text-gray-500">{t("birthdays.hint")}</p>
        </section>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "…" : t("action.save")}
          </button>
          {saved && <span className="text-sm text-green-600">{t("booking.saved")}</span>}
        </div>
      </form>

      <Note tone="info" title={t("rewards.noteTitle")}>
        {t("rewards.note")}
      </Note>
    </div>
  );
}
