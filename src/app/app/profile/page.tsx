"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { useTranslation } from "@/lib/i18n";
import { formatPhone } from "@/lib/customers";
import { Avatar, ScreenTitle, SectionTitle, Skeleton } from "@/components/customer/kit";
import { PushToggle } from "@/components/customer/PushToggle";
import { LoyaltyCard, type Loyalty } from "@/components/customer/LoyaltyCard";
import { ReferralCard, type Referral } from "@/components/customer/ReferralCard";

interface Profile {
  id: string;
  name: string;
  phone: string | null;
  visitCount: number;
  upcomingCount: number;
  loyalty: Loyalty | null;
}

/** Who they are, what they have had, and the way out. */
export default function CustomerProfilePage() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [referral, setReferral] = useState<Referral | null>(null);

  useEffect(() => {
    fetch("/api/customer/me")
      .then((r) => r.json())
      .then((d) => {
        setProfile(d);
        setName(d?.name ?? "");
      })
      .catch(() => setProfile(null));

    fetch("/api/customer/referral")
      .then((r) => r.json())
      .then((d) => setReferral(d?.enabled ? d : null))
      .catch(() => setReferral(null));
  }, []);

  const save = async (body: Record<string, string>) => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/customer/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setMessage(t("booking.saved"));
        setCurrentPassword("");
        setNewPassword("");
        setTimeout(() => setMessage(""), 3000);
      } else {
        setError((await res.json()).error ?? t("appointments.actionFailed"));
      }
    } catch {
      setError(t("appointments.networkError"));
    } finally {
      setSaving(false);
    }
  };

  if (!profile) {
    return (
      <div className="space-y-3 pt-4">
        <Skeleton className="h-36" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-2">
      <ScreenTitle title={t("app.navProfile")} />

      <section className="c-card-raised animate-fade-up p-5">
        <div className="flex items-center gap-4">
          <Avatar name={profile.name} size={56} />
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold text-white">{profile.name}</div>
            <div className="text-sm text-white/45">{formatPhone(profile.phone)}</div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white/[0.04] py-3 text-center">
            <div className="text-2xl font-bold tabular-nums text-white">{profile.visitCount}</div>
            <div className="mt-0.5 text-[11px] text-white/40">{t("app.visitsSoFar")}</div>
          </div>
          <div className="rounded-xl bg-white/[0.04] py-3 text-center">
            <div className="text-2xl font-bold tabular-nums text-brass-300">{profile.upcomingCount}</div>
            <div className="mt-0.5 text-[11px] text-white/40">{t("app.upcomingCount")}</div>
          </div>
        </div>
      </section>

      {profile.loyalty && (
        <section>
          <SectionTitle>{t("app.loyaltyTitle")}</SectionTitle>
          <LoyaltyCard loyalty={profile.loyalty} />
        </section>
      )}

      {referral && (
        <section>
          <SectionTitle>{t("app.referralTitle")}</SectionTitle>
          <ReferralCard referral={referral} />
        </section>
      )}

      <section>
        <SectionTitle>{t("app.notifications")}</SectionTitle>
        <PushToggle />
      </section>

      <section>
        <SectionTitle>{t("app.yourDetails")}</SectionTitle>
        <div className="c-card space-y-3 p-5">
          <div>
            <label className="c-label">{t("field.name")}</label>
            <input className="c-input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <button type="button" onClick={() => save({ name })} disabled={saving} className="c-btn-secondary w-full">
            {t("action.save")}
          </button>
        </div>
      </section>

      <section>
        <SectionTitle>{t("app.changePassword")}</SectionTitle>
        <div className="c-card space-y-3 p-5">
          <div>
            <label className="c-label">{t("app.currentPassword")}</label>
            <input
              type="password"
              className="c-input"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div>
            <label className="c-label">{t("app.newPassword")}</label>
            <input
              type="password"
              className="c-input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <button
            type="button"
            onClick={() => save({ currentPassword, newPassword })}
            disabled={saving || !currentPassword || newPassword.length < 6}
            className="c-btn-secondary w-full"
          >
            {t("app.changePassword")}
          </button>
        </div>
      </section>

      {message && (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{message}</div>
      )}
      {error && <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div>}

      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/app/login" })}
        className="c-btn-ghost w-full text-red-300 hover:bg-red-400/10 hover:text-red-200"
      >
        {t("auth.signOut")}
      </button>

      <p className="pb-2 text-center text-[11px] text-white/25">Escape Barbershop</p>
    </div>
  );
}
