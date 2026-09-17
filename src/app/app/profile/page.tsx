"use client";

import { useCallback, useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { useTranslation } from "@/lib/i18n";
import { formatPhone } from "@/lib/customers";
import { ScreenTitle, SectionTitle, Skeleton } from "@/components/customer/kit";
import { PushToggle } from "@/components/customer/PushToggle";
import { PhotoPicker } from "@/components/customer/PhotoPicker";
import { CutsWanted } from "@/components/customer/CutsWanted";
import { LoyaltyCard, type Loyalty } from "@/components/customer/LoyaltyCard";
import { ReferralCard, type Referral } from "@/components/customer/ReferralCard";

/**
 * Who they are, what they have had, and the way out.
 *
 * Everything here is theirs to change — their picture, their name, the number
 * they sign in with, the birthday the shop wishes them on. It saves when they
 * ask it to rather than on every keystroke, so a half-typed number is never
 * sent anywhere.
 */

interface Profile {
  id: string;
  name: string;
  phone: string | null;
  photo: string | null;
  birthday: string | null;
  visitCount: number;
  upcomingCount: number;
  loyalty: Loyalty | null;
}

export default function CustomerProfilePage() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [referral, setReferral] = useState<Referral | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthday, setBirthday] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    fetch("/api/customer/me")
      .then((r) => r.json())
      .then((d: Profile) => {
        setProfile(d);
        setName(d?.name ?? "");
        setPhone(d?.phone ?? "");
        setBirthday(d?.birthday ? String(d.birthday).slice(0, 10) : "");
      })
      .catch(() => setProfile(null));
  }, []);

  useEffect(() => {
    load();
    fetch("/api/customer/referral")
      .then((r) => r.json())
      .then((d) => setReferral(d?.enabled ? d : null))
      .catch(() => setReferral(null));
  }, [load]);

  const save = async (body: Record<string, string | null>) => {
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
        load();
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

  const savedBirthday = profile.birthday ? String(profile.birthday).slice(0, 10) : "";
  const detailsChanged =
    name.trim() !== profile.name || phone.trim() !== (profile.phone ?? "") || birthday !== savedBirthday;

  return (
    <div className="space-y-6 pt-2">
      <ScreenTitle title={t("app.navProfile")} />

      <section className="c-card-raised animate-fade-up p-5">
        <PhotoPicker name={profile.name} photo={profile.photo} onChange={(photo) => save({ photo: photo ?? "" })} />

        <div className="mt-4 border-t border-hair pt-4">
          <div className="truncate text-lg font-semibold text-ink">{profile.name}</div>
          <div className="text-sm text-soft">{formatPhone(profile.phone)}</div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="border border-hair py-3 text-center">
            <div className="c-display text-2xl tabular-nums text-ink">{profile.visitCount}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-faint">{t("app.visitsSoFar")}</div>
          </div>
          <div className="border border-hair py-3 text-center">
            <div className="c-display text-2xl tabular-nums text-accent">{profile.upcomingCount}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-faint">{t("app.upcomingCount")}</div>
          </div>
        </div>
      </section>

      <CutsWanted />

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
            <label className="c-label" htmlFor="profile-name">
              {t("field.name")}
            </label>
            <input id="profile-name" className="c-input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <label className="c-label" htmlFor="profile-phone">
              {t("field.phone")}
            </label>
            <input
              id="profile-phone"
              className="c-input tracking-wide"
              type="tel"
              inputMode="numeric"
              placeholder="01X XXXX XXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-faint">{t("app.phoneIsLogin")}</p>
          </div>

          <div>
            <label className="c-label" htmlFor="profile-birthday">
              {t("birthdays.field")}
            </label>
            <input
              id="profile-birthday"
              className="c-input"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-faint">{t("app.birthdayHint")}</p>
          </div>

          <button
            type="button"
            onClick={() =>
              // Only what actually changed: saving a name must never be refused
              // because of the number sitting untouched in the next field.
              save({
                ...(name.trim() !== profile.name ? { name: name.trim() } : {}),
                ...(phone.trim() !== (profile.phone ?? "") ? { phone: phone.trim() } : {}),
                ...(birthday !== savedBirthday ? { birthday } : {}),
              })
            }
            disabled={saving || !detailsChanged || name.trim().length < 2}
            className="c-btn-secondary w-full"
          >
            {saving ? "…" : t("action.save")}
          </button>
        </div>
      </section>

      <section>
        <SectionTitle>{t("app.changePassword")}</SectionTitle>
        <div className="c-card space-y-3 p-5">
          <div>
            <label className="c-label" htmlFor="profile-current">
              {t("app.currentPassword")}
            </label>
            <input
              id="profile-current"
              type="password"
              className="c-input"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div>
            <label className="c-label" htmlFor="profile-new">
              {t("app.newPassword")}
            </label>
            <input
              id="profile-new"
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
        <div className="border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-300">{message}</div>
      )}
      {error && <div className="border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">{error}</div>}

      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/app/login" })}
        className="c-btn-ghost w-full text-red-300 hover:text-red-200"
      >
        {t("auth.signOut")}
      </button>

      <p className="pb-2 text-center text-[10px] uppercase tracking-[0.3em] text-faint">Escape Barbershop</p>
    </div>
  );
}
