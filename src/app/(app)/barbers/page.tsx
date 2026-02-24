"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { useTranslation } from "@/lib/i18n";

interface SalarySettings {
  baseSalary: number;
  commissionType: "PERCENT" | "FIXED_PER_VISIT";
  commissionValue: number;
}

interface Barber {
  id: string;
  name: string;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  salarySettings: SalarySettings | null;
  _count: { visits: number };
}

const defaultForm = { name: "", phone: "", isActive: true };
const defaultSalary = {
  baseSalary: "0",
  commissionType: "PERCENT" as "PERCENT" | "FIXED_PER_VISIT",
  commissionValue: "0",
};

export default function BarbersPage() {
  const { t, fmtCurrency } = useTranslation();
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [salaryModalOpen, setSalaryModalOpen] = useState(false);
  const [editing, setEditing] = useState<Barber | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [salaryForm, setSalaryForm] = useState(defaultSalary);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/barbers")
      .then((r) => r.json())
      .then((data) => setBarbers(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openCreate = () => { setEditing(null); setForm(defaultForm); setErrors({}); setModalOpen(true); };
  const openEdit = (b: Barber) => {
    setEditing(b);
    setForm({ name: b.name, phone: b.phone ?? "", isActive: b.isActive });
    setErrors({});
    setModalOpen(true);
  };
  const openSalary = (b: Barber) => {
    setEditing(b);
    setSalaryForm({
      baseSalary: String(b.salarySettings?.baseSalary ?? 0),
      commissionType: b.salarySettings?.commissionType ?? "PERCENT",
      commissionValue: String(b.salarySettings?.commissionValue ?? 0),
    });
    setErrors({});
    setSalaryModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setErrors({ name: "Name is required" }); return; }
    setSaving(true);
    try {
      const url = editing ? `/api/barbers/${editing.id}` : "/api/barbers";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, phone: form.phone || null }),
      });
      if (res.ok) { setModalOpen(false); load(); }
      else { const d = await res.json(); setErrors({ form: d.error ?? "Failed" }); }
    } finally { setSaving(false); }
  };

  const handleSalarySave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/barbers/${editing.id}/salary`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseSalary: parseFloat(salaryForm.baseSalary) || 0,
          commissionType: salaryForm.commissionType,
          commissionValue: parseFloat(salaryForm.commissionValue) || 0,
        }),
      });
      if (res.ok) { setSalaryModalOpen(false); load(); }
    } finally { setSaving(false); }
  };

  const toggleActive = async (b: Barber) => {
    await fetch(`/api/barbers/${b.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !b.isActive }),
    });
    load();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeader
        title={t("barbers.title")}
        subtitle={t("barbers.subtitle")}
        action={
          <button onClick={openCreate} className="btn-primary">{t("action.addBarber")}</button>
        }
      />

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-4 animate-pulse h-16 bg-gray-100" />
          ))}
        </div>
      ) : barbers.length === 0 ? (
        <EmptyState icon="💈" title={t("barbers.noBarbers")}
          action={<button onClick={openCreate} className="btn-primary">{t("action.addBarber")}</button>}
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("field.name")}</th>
                <th className="th-start px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">{t("field.phone")}</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">{t("field.status")}</th>
                <th className="text-end px-4 py-3 font-medium text-gray-600 hidden md:table-cell">{t("common.visits")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {barbers.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{b.name}</div>
                    {b.salarySettings && (
                      <div className="text-xs text-gray-400">
                        {t("field.baseSalary").replace(" ($)", "")}: ${fmtCurrency(b.salarySettings.baseSalary)} |{" "}
                        {b.salarySettings.commissionType === "PERCENT"
                          ? `${b.salarySettings.commissionValue}% ${t("barbers.commission")}`
                          : `$${fmtCurrency(b.salarySettings.commissionValue)}${t("barbers.perVisit")}`}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{b.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={b.isActive ? "green" : "gray"}>
                      {b.isActive ? t("common.active") : t("common.inactive")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-end text-gray-600 hidden md:table-cell">{b._count.visits}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openSalary(b)} className="btn-ghost text-xs px-2 py-1">{t("barbers.salarySettings").replace(" —", "")}</button>
                      <button onClick={() => openEdit(b)} className="btn-secondary text-xs px-2 py-1">{t("action.edit")}</button>
                      <button onClick={() => toggleActive(b)} className="btn-ghost text-xs px-2 py-1">
                        {b.isActive ? t("action.deactivate") : t("action.activate")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Barber form */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
        title={editing ? t("barbers.editBarber") : t("barbers.newBarber")}>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="label">{t("field.name")}</label>
            <input className="input" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t("barbers.barberName")} />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
          </div>
          <div>
            <label className="label">{t("field.phone")} <span className="text-gray-400 font-normal">({t("field.optional")})</span></label>
            <input className="input" value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+1 234 567 8900" />
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="barberActive" checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="rounded border-gray-300" />
            <label htmlFor="barberActive" className="text-sm text-gray-700">{t("barbers.active")}</label>
          </div>
          {errors.form && <p className="text-red-500 text-sm">{errors.form}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary flex-1">{t("action.cancel")}</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? t("action.saving") : t("action.save")}</button>
          </div>
        </form>
      </Modal>

      {/* Salary settings */}
      <Modal open={salaryModalOpen} onClose={() => setSalaryModalOpen(false)}
        title={`${t("barbers.salarySettings")} ${editing?.name}`}>
        <form onSubmit={handleSalarySave} className="space-y-4">
          <div>
            <label className="label">{t("field.baseSalary")}</label>
            <input type="number" min="0" step="0.01" className="input"
              value={salaryForm.baseSalary}
              onChange={(e) => setSalaryForm({ ...salaryForm, baseSalary: e.target.value })} />
          </div>
          <div>
            <label className="label">{t("field.commissionType")}</label>
            <select className="input" value={salaryForm.commissionType}
              onChange={(e) => setSalaryForm({ ...salaryForm, commissionType: e.target.value as "PERCENT" | "FIXED_PER_VISIT" })}>
              <option value="PERCENT">{t("common.percent")}</option>
              <option value="FIXED_PER_VISIT">{t("common.fixedPerVisit")}</option>
            </select>
          </div>
          <div>
            <label className="label">
              {t("field.commissionValue")} ({salaryForm.commissionType === "PERCENT" ? "%" : "$"})
            </label>
            <input type="number" min="0" step="0.01" className="input"
              value={salaryForm.commissionValue}
              onChange={(e) => setSalaryForm({ ...salaryForm, commissionValue: e.target.value })} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setSalaryModalOpen(false)} className="btn-secondary flex-1">{t("action.cancel")}</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? t("action.saving") : t("action.save")}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
