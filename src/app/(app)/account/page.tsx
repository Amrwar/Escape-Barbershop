"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { useTranslation } from "@/lib/i18n";
import { Icon } from "@/components/ui/Icon";

interface Me {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface StaffUser {
  id: string;
  name: string;
  /** The office signs in with an email, a barber with the phone in their hand. */
  email: string | null;
  phone: string | null;
  role: "OWNER" | "CASHIER" | "BARBER";
  /** Set on a barber's login: which barber it belongs to. */
  barber?: { id: string; name: string } | null;
}

export default function AccountPage() {
  const { t } = useTranslation();
  const { data: session, status } = useSession();
  const isOwner = session?.user?.role === "OWNER";

  const [me, setMe] = useState<Me | null>(null);
  const [users, setUsers] = useState<StaffUser[]>([]);

  // Change my password
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwDone, setPwDone] = useState(false);

  // Add account
  const [addOpen, setAddOpen] = useState(false);
  const [barbers, setBarbers] = useState<{ id: string; name: string }[]>([]);
  const [addForm, setAddForm] = useState<{
    name: string;
    email: string;
    phone: string;
    password: string;
    role: "OWNER" | "CASHIER" | "BARBER";
    barberId: string;
  }>({
    name: "",
    email: "",
    phone: "",
    password: "",
    role: "CASHIER",
    barberId: "",
  });
  const [addError, setAddError] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset someone else
  const [resetUser, setResetUser] = useState<StaffUser | null>(null);
  const [resetPw, setResetPw] = useState("");
  const [resetError, setResetError] = useState("");

  const loadUsers = useCallback(() => {
    if (!isOwner) return;
    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => setUsers(Array.isArray(d) ? d : []))
      .catch(() => setUsers([]));
  }, [isOwner]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/account")
      .then((r) => r.json())
      .then((d) => setMe(d?.error ? null : d))
      .catch(() => setMe(null));
    loadUsers();
    // For the "which barber is this login for?" picker.
    fetch("/api/barbers?active=true")
      .then((r) => r.json())
      .then((d) => setBarbers(Array.isArray(d) ? d.map((b: { id: string; name: string }) => ({ id: b.id, name: b.name })) : []))
      .catch(() => setBarbers([]));
  }, [status, loadUsers]);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError("");
    setPwDone(false);
    if (pw.next.length < 8) return setPwError(t("account.passwordTooShort"));
    if (pw.next !== pw.confirm) return setPwError(t("account.passwordMismatch"));

    setPwSaving(true);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }),
      });
      if (res.ok) {
        setPw({ current: "", next: "", confirm: "" });
        setPwDone(true);
      } else {
        const d = await res.json().catch(() => ({}));
        setPwError(d.error === "current_password_wrong" ? t("account.currentWrong") : t("account.saveFailed"));
      }
    } finally {
      setPwSaving(false);
    }
  };

  /** A barber signs in with a phone and a PIN; the office with email and password. */
  const byPhone = addForm.role === "BARBER";

  const addUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError("");

    if (byPhone) {
      if (!addForm.phone.trim()) return setAddError(t("account.phoneRequired"));
      if (!/^\d{6,}$/.test(addForm.password)) return setAddError(t("account.pinTooShort"));
      if (!addForm.barberId) return setAddError(t("account.pickBarber"));
    } else if (addForm.password.length < 8) {
      return setAddError(t("account.passwordTooShort"));
    }

    setSaving(true);
    try {
      const { name, password, role, barberId, email, phone } = addForm;
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          byPhone
            ? { name, password, role, barberId, phone: phone.trim() }
            : { name, password, role, email: email.trim() }
        ),
      });
      if (res.ok) {
        setAddOpen(false);
        setAddForm({ name: "", email: "", phone: "", password: "", role: "CASHIER", barberId: "" });
        loadUsers();
      } else {
        const d = await res.json().catch(() => ({}));
        const said: Record<string, string> = {
          email_exists: t("account.emailExists"),
          phone_exists: t("account.phoneExists"),
          invalid_phone: t("app.badPhone"),
        };
        setAddError(said[d.error] ?? t("account.saveFailed"));
      }
    } finally {
      setSaving(false);
    }
  };

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUser) return;
    setResetError("");

    // A phone login is reset to a new PIN, an email login to a new password.
    const onPhone = !resetUser.email;
    if (onPhone ? !/^\d{6,}$/.test(resetPw) : resetPw.length < 8) {
      return setResetError(onPhone ? t("account.pinTooShort") : t("account.passwordTooShort"));
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/users/${resetUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: resetPw }),
      });
      if (res.ok) {
        setResetUser(null);
        setResetPw("");
      } else {
        setResetError(t("account.saveFailed"));
      }
    } finally {
      setSaving(false);
    }
  };

  const removeUser = async (u: StaffUser) => {
    if (!confirm(`${t("action.delete")} ${u.email ?? u.phone ?? u.name}?`)) return;
    const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(
        d.error === "last_owner"
          ? t("account.lastOwner")
          : d.error === "cannot_delete_self"
          ? t("account.cannotDeleteSelf")
          : d.error === "has_history"
          ? t("account.hasHistory")
          : t("account.saveFailed")
      );
    }
    loadUsers();
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <PageHeader title={t("account.title")} subtitle={t("account.subtitle")} />

      {/* My login */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">{t("account.myLogin")}</h2>

        <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm mb-5">
          <div>
            <div className="text-xs text-gray-500">{t("auth.email")}</div>
            <div className="font-medium text-gray-900">{me?.email ?? "…"}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">{t("field.name")}</div>
            <div className="font-medium text-gray-900">{me?.name ?? "…"}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">{t("field.status")}</div>
            <div className="font-medium text-gray-900">
              {me?.role === "OWNER" ? t("common.owner") : t("common.cashier")}
            </div>
          </div>
        </div>

        <form onSubmit={changePassword} className="space-y-3 border-t border-gray-100 pt-4">
          <h3 className="text-sm font-medium text-gray-900">{t("account.changePassword")}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label">{t("account.currentPassword")}</label>
              <input
                type="password"
                autoComplete="current-password"
                className="input"
                value={pw.current}
                onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="label">{t("account.newPassword")}</label>
              <input
                type="password"
                autoComplete="new-password"
                className="input"
                value={pw.next}
                onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="label">{t("account.confirmPassword")}</label>
              <input
                type="password"
                autoComplete="new-password"
                className="input"
                value={pw.confirm}
                onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
                required
              />
            </div>
          </div>

          {pwError && <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{pwError}</div>}
          {pwDone && <div className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">{t("account.passwordChanged")}</div>}

          <div className="flex items-center gap-3">
            <button type="submit" className="btn-primary" disabled={pwSaving}>
              {pwSaving ? t("action.saving") : t("account.changePassword")}
            </button>
            <span className="text-xs text-gray-500">{t("account.passwordHint")}</span>
          </div>
        </form>
      </div>

      {/* Staff accounts — owner only */}
      {isOwner && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">{t("account.staffTitle")}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{t("account.staffSubtitle")}</p>
            </div>
            <button onClick={() => { setAddError(""); setAddOpen(true); }} className="btn-primary">
              <Icon name="users" /> {t("account.addAccount")}
            </button>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("field.name")}</th>
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("auth.email")}</th>
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("account.role")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {u.name}
                    {u.id === me?.id && (
                      <span className="ms-2 text-xs text-gray-400">({t("account.you")})</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600" dir={u.email ? undefined : "ltr"}>
                    {u.email ?? u.phone ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={u.role === "OWNER" ? "ink" : u.role === "BARBER" ? "blue" : "gray"}>
                      {u.role === "OWNER"
                        ? t("common.owner")
                        : u.role === "BARBER"
                          ? `${t("common.barber")}${u.barber ? ` · ${u.barber.name}` : ""}`
                          : t("common.cashier")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-end whitespace-nowrap">
                    <button
                      onClick={() => { setResetUser(u); setResetPw(""); setResetError(""); }}
                      className="text-xs text-primary-700 hover:underline"
                    >
                      {t("account.resetPassword")}
                    </button>
                    {u.id !== me?.id && (
                      <button
                        onClick={() => removeUser(u)}
                        className="text-xs text-red-400 hover:text-red-600 ms-3"
                      >
                        {t("action.delete")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add account */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={t("account.addAccount")} size="sm">
        <form onSubmit={addUser} className="space-y-4">
          <div>
            <label className="label">{t("field.name")}</label>
            <input
              className="input"
              value={addForm.name}
              onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
              required
            />
          </div>
          {/* The role comes first, because it decides what the rest asks for. */}
          <div>
            <label className="label">{t("account.role")}</label>
            <select
              className="input"
              value={addForm.role}
              onChange={(e) => setAddForm((p) => ({ ...p, role: e.target.value as "OWNER" | "CASHIER" | "BARBER" }))}
            >
              <option value="CASHIER">{t("common.cashier")}</option>
              <option value="OWNER">{t("common.owner")}</option>
              <option value="BARBER">{t("common.barber")}</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">{t("account.roleHint")}</p>
          </div>

          {byPhone ? (
            <>
              <div>
                <label className="label">{t("field.phone")}</label>
                <input
                  type="tel"
                  inputMode="tel"
                  dir="ltr"
                  className="input"
                  placeholder="01xxxxxxxxx"
                  value={addForm.phone}
                  onChange={(e) => setAddForm((p) => ({ ...p, phone: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="label">{t("account.pin")}</label>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  dir="ltr"
                  className="input tracking-widest"
                  placeholder="••••••"
                  value={addForm.password}
                  onChange={(e) => setAddForm((p) => ({ ...p, password: e.target.value.replace(/\D/g, "") }))}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">{t("account.pinHint")}</p>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="label">{t("auth.email")}</label>
                <input
                  type="email"
                  className="input"
                  value={addForm.email}
                  onChange={(e) => setAddForm((p) => ({ ...p, email: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="label">{t("auth.password")}</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  className="input"
                  value={addForm.password}
                  onChange={(e) => setAddForm((p) => ({ ...p, password: e.target.value }))}
                  required
                />
              </div>
            </>
          )}

          {/* A barber's login only sees their own day, customers and earnings. */}
          {addForm.role === "BARBER" && (
            <div>
              <label className="label">{t("field.barber")}</label>
              <select
                className="input"
                value={addForm.barberId}
                onChange={(e) => setAddForm((p) => ({ ...p, barberId: e.target.value }))}
              >
                <option value="">—</option>
                {barbers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">{t("account.barberHint")}</p>
            </div>
          )}

          {addError &&<div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{addError}</div>}

          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-secondary" onClick={() => setAddOpen(false)}>
              {t("action.cancel")}
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? t("action.saving") : t("action.save")}
            </button>
          </div>
        </form>
      </Modal>

      {/* Reset someone else */}
      <Modal
        open={Boolean(resetUser)}
        onClose={() => setResetUser(null)}
        title={`${t("account.resetPassword")} — ${resetUser?.email ?? ""}`}
        size="sm"
      >
        <form onSubmit={submitReset} className="space-y-4">
          <div>
            <label className="label">{t("account.newPassword")}</label>
            <input
              type="password"
              autoComplete="new-password"
              className="input"
              value={resetPw}
              onChange={(e) => setResetPw(e.target.value)}
              required
            />
            <p className="text-xs text-gray-500 mt-1">{t("account.resetHint")}</p>
          </div>
          {resetError && <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{resetError}</div>}
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-secondary" onClick={() => setResetUser(null)}>
              {t("action.cancel")}
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? t("action.saving") : t("action.save")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
