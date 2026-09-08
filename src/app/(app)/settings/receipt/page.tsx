"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/lib/i18n";

interface ReceiptSettings {
  shopName: string;
  shopPhone: string;
  shopAddress: string;
  receiptFooter: string;
  shopLogo: string | null;
}

export default function ReceiptSettingsPage() {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<ReceiptSettings>({
    shopName: "",
    shopPhone: "",
    shopAddress: "",
    receiptFooter: "",
    shopLogo: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoMsg, setLogoMsg] = useState("");

  // Authorization PIN (edit_pin)
  const [currentEditPin, setCurrentEditPin] = useState("");
  const [editPin, setEditPin] = useState("");
  const [pinSaving, setPinSaving] = useState(false);
  const [pinMsg, setPinMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Security PIN (discount_pin — used for discounts & all deletions)
  const [currentSecurityPin, setCurrentSecurityPin] = useState("");
  const [securityPin, setSecurityPin] = useState("");
  const [securityPinSaving, setSecurityPinSaving] = useState(false);
  const [securityPinMsg, setSecurityPinMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const handleSecurityPinSave = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setSecurityPinMsg(null);
    setSecurityPinSaving(true);
    try {
      const res = await fetch("/api/settings/discount-pin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: securityPin, currentPin: currentSecurityPin }),
      });
      if (res.ok) {
        setCurrentSecurityPin("");
        setSecurityPin("");
        setSecurityPinMsg({ text: t("settings.securityPinSaved"), ok: true });
        setTimeout(() => setSecurityPinMsg(null), 3000);
      } else {
        const d = await res.json();
        const msg = d.error === "current_pin_wrong" ? t("newVisit.wrongPin") : (d.error ?? "Failed");
        setSecurityPinMsg({ text: msg, ok: false });
      }
    } finally {
      setSecurityPinSaving(false);
    }
  }, [currentSecurityPin, securityPin, t]);

  const handlePinSave = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setPinMsg(null);
    setPinSaving(true);
    try {
      const res = await fetch("/api/settings/edit-pin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: editPin, currentPin: currentEditPin }),
      });
      if (res.ok) {
        setCurrentEditPin("");
        setEditPin("");
        setPinMsg({ text: t("settings.editPinSaved"), ok: true });
        setTimeout(() => setPinMsg(null), 3000);
      } else {
        const d = await res.json();
        const msg = d.error === "current_pin_wrong" ? t("newVisit.wrongPin") : (d.error ?? "Failed");
        setPinMsg({ text: msg, ok: false });
      }
    } finally {
      setPinSaving(false);
    }
  }, [currentEditPin, editPin, t]);

  useEffect(() => {
    fetch("/api/settings/receipt")
      .then((r) => r.json())
      .then((data) => {
        setForm({
          shopName: data.shopName ?? "",
          shopPhone: data.shopPhone ?? "",
          shopAddress: data.shopAddress ?? "",
          receiptFooter: data.receiptFooter ?? "",
          shopLogo: data.shopLogo ?? null,
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setLogoMsg(t("settings.logoUploading"));
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/settings/upload-logo", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) {
        setForm((prev) => ({ ...prev, shopLogo: data.url }));
        setLogoMsg(t("settings.logoUploaded"));
      } else {
        setLogoMsg("Upload failed");
      }
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/settings/receipt", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopName: form.shopName,
          shopPhone: form.shopPhone || null,
          shopAddress: form.shopAddress || null,
          receiptFooter: form.receiptFooter || null,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-100 rounded w-1/3" />
          <div className="h-48 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <PageHeader
        title={t("settings.receipt.title")}
        subtitle={t("settings.receipt.subtitle")}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card p-5 space-y-4">
          {/* Shop Name */}
          <div>
            <label className="label">{t("settings.shopName")} *</label>
            <input
              className="input"
              required
              value={form.shopName}
              onChange={(e) => setForm((p) => ({ ...p, shopName: e.target.value }))}
            />
          </div>

          {/* Phone */}
          <div>
            <label className="label">{t("settings.shopPhone")}</label>
            <input
              className="input"
              value={form.shopPhone}
              onChange={(e) => setForm((p) => ({ ...p, shopPhone: e.target.value }))}
              placeholder="+965 XXXX XXXX"
            />
          </div>

          {/* Address */}
          <div>
            <label className="label">{t("settings.shopAddress")}</label>
            <textarea
              className="input"
              rows={2}
              value={form.shopAddress}
              onChange={(e) => setForm((p) => ({ ...p, shopAddress: e.target.value }))}
            />
          </div>

          {/* Footer */}
          <div>
            <label className="label">{t("settings.receiptFooter")}</label>
            <input
              className="input"
              value={form.receiptFooter}
              onChange={(e) => setForm((p) => ({ ...p, receiptFooter: e.target.value }))}
              placeholder="Thank you!"
            />
          </div>

          {/* Logo */}
          <div>
            <label className="label">{t("settings.shopLogo")}</label>
            <p className="text-xs text-gray-400 mb-2">{t("settings.logoHint")}</p>
            <div className="flex items-center gap-4">
              {form.shopLogo && (
                <img
                  src={form.shopLogo}
                  alt="Shop logo"
                  className="w-16 h-16 object-contain rounded-lg border border-gray-200 bg-gray-50"
                />
              )}
              <div>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="btn-secondary text-sm"
                >
                  {uploading ? t("settings.logoUploading") : t("settings.chooseImage")}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoChange}
                />
                {logoMsg && (
                  <p className="text-xs text-green-600 mt-1">{logoMsg}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? t("action.saving") : t("action.save")}
          </button>
          {saved && (
            <span className="text-sm text-green-600">{t("settings.saved")}</span>
          )}
        </div>
      </form>

      {/* Security PIN (discount & deletions) */}
      <div className="card p-5 mt-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">{t("settings.securityPin")}</h2>
        <p className="text-xs text-gray-400 mb-4">{t("settings.securityPinHint")}</p>
        <form onSubmit={handleSecurityPinSave} className="flex gap-3 items-end flex-wrap">
          <div className="max-w-xs">
            <label className="label">{t("settings.currentSecurityPinLabel")}</label>
            <input
              type="password"
              className="input"
              placeholder="••••"
              value={currentSecurityPin}
              onChange={(e) => setCurrentSecurityPin(e.target.value)}
              minLength={4}
              required
            />
          </div>
          <div className="max-w-xs">
            <label className="label">{t("settings.securityPinLabel")}</label>
            <input
              type="password"
              className="input"
              placeholder={t("settings.editPinPlaceholder")}
              value={securityPin}
              onChange={(e) => setSecurityPin(e.target.value)}
              minLength={4}
              required
            />
          </div>
          <button type="submit" disabled={securityPinSaving || !securityPin || !currentSecurityPin} className="btn-primary">
            {securityPinSaving ? t("action.saving") : t("action.save")}
          </button>
        </form>
        {securityPinMsg && (
          <p className={`text-sm mt-2 ${securityPinMsg.ok ? "text-green-600" : "text-red-600"}`}>
            {securityPinMsg.text}
          </p>
        )}
      </div>

      {/* Edit PIN */}
      <div className="card p-5 mt-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">{t("settings.editPin")}</h2>
        <p className="text-xs text-gray-400 mb-4">{t("settings.editPinHint")}</p>
        <form onSubmit={handlePinSave} className="flex gap-3 items-end flex-wrap">
          <div className="max-w-xs">
            <label className="label">{t("settings.currentSecurityPinLabel")}</label>
            <input
              type="password"
              className="input"
              placeholder="••••"
              value={currentEditPin}
              onChange={(e) => setCurrentEditPin(e.target.value)}
              minLength={4}
              required
            />
          </div>
          <div className="max-w-xs">
            <label className="label">{t("settings.editPinLabel")}</label>
            <input
              type="password"
              className="input"
              placeholder={t("settings.editPinPlaceholder")}
              value={editPin}
              onChange={(e) => setEditPin(e.target.value)}
              minLength={4}
              required
            />
          </div>
          <button type="submit" disabled={pinSaving || !editPin || !currentEditPin} className="btn-primary">
            {pinSaving ? t("action.saving") : t("action.save")}
          </button>
        </form>
        {pinMsg && (
          <p className={`text-sm mt-2 ${pinMsg.ok ? "text-green-600" : "text-red-600"}`}>
            {pinMsg.text}
          </p>
        )}
      </div>
    </div>
  );
}
