"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { serviceSchema } from "@/lib/validations";
import { useTranslation } from "@/lib/i18n";

interface Service {
  id: string;
  name: string;
  arabicName: string | null;
  defaultPrice: number;
  isActive: boolean;
  excludeFromCommission: boolean;
  durationMinutes: number;
  bookableOnline: boolean;
}

export default function ServicesPage() {
  const { t, fmtCurrency, lang } = useTranslation();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [form, setForm] = useState({
    name: "",
    arabicName: "",
    defaultPrice: "",
    isActive: true,
    excludeFromCommission: false,
    durationMinutes: "30",
    bookableOnline: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/services")
      .then((r) => r.json())
      .then((data) => setServices(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: "",
      arabicName: "",
      defaultPrice: "",
      isActive: true,
      excludeFromCommission: false,
      durationMinutes: "30",
      bookableOnline: true,
    });
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (s: Service) => {
    setEditing(s);
    setForm({
      name: s.name,
      arabicName: s.arabicName ?? "",
      defaultPrice: String(s.defaultPrice),
      isActive: s.isActive,
      excludeFromCommission: s.excludeFromCommission,
      durationMinutes: String(s.durationMinutes ?? 30),
      bookableOnline: s.bookableOnline ?? true,
    });
    setErrors({});
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    const parsed = serviceSchema.safeParse({
      name: form.name,
      arabicName: form.arabicName || undefined,
      defaultPrice: parseFloat(form.defaultPrice) || 0,
      isActive: form.isActive,
      excludeFromCommission: form.excludeFromCommission,
      durationMinutes: parseInt(form.durationMinutes, 10) || 30,
      bookableOnline: form.bookableOnline,
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.errors.forEach((e) => { errs[String(e.path[0])] = e.message; });
      setErrors(errs);
      return;
    }
    setSaving(true);
    try {
      const url = editing ? `/api/services/${editing.id}` : "/api/services";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (res.ok) { setModalOpen(false); load(); }
      else { const d = await res.json(); setErrors({ form: d.error ?? "Failed" }); }
    } finally { setSaving(false); }
  };

  const toggleActive = async (s: Service) => {
    await fetch(`/api/services/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !s.isActive }),
    });
    load();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeader
        title={t("services.title")}
        subtitle={t("services.subtitle")}
        action={
          <button onClick={openCreate} className="btn-primary">
            {t("action.addService")}
          </button>
        }
      />

      {loading ? (
        <div className="card divide-y divide-gray-100">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="px-4 py-3 animate-pulse flex gap-4">
              <div className="h-4 bg-gray-100 rounded flex-1" />
              <div className="h-4 bg-gray-100 rounded w-16" />
            </div>
          ))}
        </div>
      ) : services.length === 0 ? (
        <EmptyState
          icon="✂️"
          title={t("services.noServices")}
          action={<button onClick={openCreate} className="btn-primary">{t("action.addService")}</button>}
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("field.service")}</th>
                <th className="text-end px-4 py-3 font-medium text-gray-600">{t("booking.durationMinutes")}</th>
                <th className="text-end px-4 py-3 font-medium text-gray-600">{t("field.defaultPrice")}</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">{t("field.status")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {services.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {lang === "ar" && s.arabicName ? s.arabicName : s.name}
                    {s.arabicName && lang !== "ar" && (
                      <div className="text-xs text-gray-400 font-normal">{s.arabicName}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-end text-gray-500 tabular-nums">
                    {s.durationMinutes} {t("appointments.minutesShort")}
                  </td>
                  <td className="px-4 py-3 text-end text-gray-700">{fmtCurrency(s.defaultPrice)}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <Badge variant={s.isActive ? "green" : "gray"}>
                        {s.isActive ? t("common.active") : t("common.inactive")}
                      </Badge>
                      {s.excludeFromCommission && (
                        <Badge variant="yellow">{t("services.noCommission")}</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => toggleActive(s)} className="btn-ghost text-xs px-2 py-1">
                        {s.isActive ? t("action.deactivate") : t("action.activate")}
                      </button>
                      <button onClick={() => openEdit(s)} className="btn-secondary text-xs px-2 py-1">
                        {t("action.edit")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t("services.editService") : t("services.newService")}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="label">{t("field.service")}</label>
            <input className="input" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t("services.namePlaceholder")} />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
          </div>
          <div>
            <label className="label">{t("services.arabicName")} <span className="text-gray-400 font-normal">({t("field.optional")})</span></label>
            <input className="input" dir="rtl" value={form.arabicName}
              onChange={(e) => setForm({ ...form, arabicName: e.target.value })}
              placeholder="مثال: قص شعر" />
          </div>
          <div>
            <label className="label">{t("booking.durationMinutes")}</label>
            <input
              type="number"
              min="5"
              max="600"
              step="5"
              className="input"
              value={form.durationMinutes}
              onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
            />
            {errors.durationMinutes && <p className="text-red-500 text-xs mt-1">{errors.durationMinutes}</p>}
          </div>

          <div>
            <label className="label">{t("field.defaultPrice")}</label>
            <input type="number" min="0" step="0.01" className="input" value={form.defaultPrice}
              onChange={(e) => setForm({ ...form, defaultPrice: e.target.value })}
              placeholder="0.00" />
            {errors.defaultPrice && <p className="text-red-500 text-xs mt-1">{errors.defaultPrice}</p>}
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="isActive" checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="rounded border-gray-300 text-primary-600" />
            <label htmlFor="isActive" className="text-sm text-gray-700">
              {t("services.activeHint")}
            </label>
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="bookableOnline" checked={form.bookableOnline}
              onChange={(e) => setForm({ ...form, bookableOnline: e.target.checked })}
              className="rounded border-gray-300 text-primary-600" />
            <label htmlFor="bookableOnline" className="text-sm text-gray-700">
              {t("booking.bookableOnline")}
            </label>
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="excludeFromCommission" checked={form.excludeFromCommission}
              onChange={(e) => setForm({ ...form, excludeFromCommission: e.target.checked })}
              className="rounded border-gray-300 text-amber-600" />
            <label htmlFor="excludeFromCommission" className="text-sm text-gray-700">
              {t("services.excludeFromCommission")}
            </label>
          </div>
          {errors.form && <p className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">{errors.form}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary flex-1">{t("action.cancel")}</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? t("action.saving") : t("action.save")}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
