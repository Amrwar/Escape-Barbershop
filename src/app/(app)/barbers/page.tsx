"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
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
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Barber | null>(null);
  const [deletePin, setDeletePin] = useState("");
  const [deletePinError, setDeletePinError] = useState("");
  const [deletePinVerifying, setDeletePinVerifying] = useState(false);

  const openDelete = (b: Barber) => {
    setDeleteTarget(b);
    setDeletePin("");
    setDeletePinError("");
    setDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeletePinError("");
    setDeletePinVerifying(true);
    try {
      const pinRes = await fetch("/api/settings/discount-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: deletePin }),
      });
      const pinData = await pinRes.json();
      if (!pinData.valid) { setDeletePinError(t("newVisit.wrongPin")); return; }
      const res = await fetch(`/api/barbers/${deleteTarget.id}`, { method: "DELETE" });
      if (res.ok) {
        setDeleteModal(false);
        load();
      } else {
        const d = await res.json();
        if (d.error === "has_visits") {
          setDeletePinError(t("barbers.hasVisitsError"));
        } else {
          setDeletePinError(d.error ?? "Failed");
        }
      }
    } finally {
      setDeletePinVerifying(false);
    }
  };

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
                        {t("field.baseSalary").replace(" ($)", "")}: {fmtCurrency(b.salarySettings.baseSalary)} |{" "}
                        {b.salarySettings.commissionType === "PERCENT"
                          ? `${b.salarySettings.commissionValue}% ${t("barbers.commission")}`
                          : `${fmtCurrency(b.salarySettings.commissionValue)}${t("barbers.perVisit")}`}
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
                    <div className="flex items-center justify-end gap-2" ref={openMenu === b.id ? menuRef : null}>
                      <Link href={`/barbers/${b.id}/stats`} className="btn-ghost text-xs px-2 py-1">{t("action.stats")}</Link>
                      <button onClick={() => openEdit(b)} className="btn-secondary text-xs px-2 py-1">{t("action.edit")}</button>
                      <div className="relative">
                        <button
                          onClick={() => setOpenMenu(openMenu === b.id ? null : b.id)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 font-bold text-base shrink-0"
                        >
                          ⋮
                        </button>
                        {openMenu === b.id && (
                          <div className="absolute ltr:right-0 rtl:left-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
                            <button
                              onClick={() => { openSalary(b); setOpenMenu(null); }}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              {t("barbers.salarySettings").replace(" —", "")}
                            </button>
                            <button
                              onClick={() => { toggleActive(b); setOpenMenu(null); }}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              {b.isActive ? t("action.deactivate") : t("action.activate")}
                            </button>
                            <div className="border-t border-gray-100 my-1" />
                            <button
                              onClick={() => { openDelete(b); setOpenMenu(null); }}
                              className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50"
                            >
                              {t("action.delete")}
                            </button>
                          </div>
                        )}
                      </div>
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

      {/* Delete barber */}
      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title={t("action.delete")} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {t("barbers.deleteConfirm")} <strong>{deleteTarget?.name}</strong>?
          </p>
          <p className="text-sm text-gray-600">{t("settings.securityPinVerify")}</p>
          <input
            type="password"
            className="input text-center text-xl tracking-widest"
            placeholder="••••"
            value={deletePin}
            onChange={(e) => setDeletePin(e.target.value)}
            autoFocus
            maxLength={20}
          />
          {deletePinError && <p className="text-red-500 text-sm text-center">{deletePinError}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={() => setDeleteModal(false)} className="btn-secondary flex-1">{t("action.cancel")}</button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={deletePinVerifying || !deletePin}
              className="flex-1 py-2 px-4 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deletePinVerifying ? "…" : t("action.delete")}
            </button>
          </div>
        </div>
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
