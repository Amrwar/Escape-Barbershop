"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { useTranslation } from "@/lib/i18n";
import { formatPhone } from "@/lib/customers";

interface Profile {
  id: string;
  name: string;
  phone: string | null;
  visitCount: number;
  upcomingCount: number;
}

/** Name, password, and the way out. */
export default function CustomerProfilePage() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/customer/me")
      .then((r) => r.json())
      .then((d) => {
        setProfile(d);
        setName(d?.name ?? "");
      })
      .catch(() => setProfile(null));
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
      } else {
        setError((await res.json()).error ?? t("appointments.actionFailed"));
      }
    } catch {
      setError(t("appointments.networkError"));
    } finally {
      setSaving(false);
    }
  };

  if (!profile) return <div className="card h-48 animate-pulse bg-gray-100" />;

  return (
    <div className="space-y-5">
      <div className="card p-5 text-center">
        <div className="w-16 h-16 rounded-full bg-primary-100 text-primary-800 text-xl font-bold flex items-center justify-center mx-auto mb-3">
          {profile.name?.[0]?.toUpperCase() ?? "?"}
        </div>
        <div className="font-bold text-gray-900">{profile.name}</div>
        <div className="text-sm text-gray-500">{formatPhone(profile.phone)}</div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-center">
          <div className="bg-gray-50 rounded-xl py-3">
            <div className="text-lg font-bold text-gray-900">{profile.visitCount}</div>
            <div className="text-[11px] text-gray-500">{t("app.visitsSoFar")}</div>
          </div>
          <div className="bg-gray-50 rounded-xl py-3">
            <div className="text-lg font-bold text-gray-900">{profile.upcomingCount}</div>
            <div className="text-[11px] text-gray-500">{t("app.upcomingCount")}</div>
          </div>
        </div>
      </div>

      <div className="card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">{t("app.yourDetails")}</h2>
        <div>
          <label className="label">{t("field.name")}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button type="button" onClick={() => save({ name })} disabled={saving} className="btn-secondary w-full">
          {t("action.save")}
        </button>
      </div>

      <div className="card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">{t("app.changePassword")}</h2>
        <div>
          <label className="label">{t("app.currentPassword")}</label>
          <input type="password" className="input" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
        </div>
        <div>
          <label className="label">{t("app.newPassword")}</label>
          <input type="password" className="input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
        </div>
        <button
          type="button"
          onClick={() => save({ currentPassword, newPassword })}
          disabled={saving || !currentPassword || newPassword.length < 6}
          className="btn-secondary w-full"
        >
          {t("app.changePassword")}
        </button>
      </div>

      {message && <div className="bg-green-50 text-green-800 text-sm px-4 py-3 rounded-lg border border-green-200">{message}</div>}
      {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">{error}</div>}

      <button type="button" onClick={() => signOut({ callbackUrl: "/app/login" })} className="btn-ghost w-full text-red-500">
        {t("auth.signOut")}
      </button>
    </div>
  );
}
