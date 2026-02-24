"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { useTranslation } from "@/lib/i18n";

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  createdAt: string;
  _count: { visits: number };
}

export default function CustomersPage() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const isOwner = session?.user?.role === "OWNER";
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", notes: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback((q = search) => {
    setLoading(true);
    fetch(`/api/customers?search=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((data) => setCustomers(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => {
    const timeout = setTimeout(() => load(search), 300);
    return () => clearTimeout(timeout);
  }, [search, load]);

  const handleDelete = async (id: string) => {
    if (!confirm(t("action.delete") + "?")) return;
    setDeletingId(id);
    await fetch(`/api/customers/${id}`, { method: "DELETE" });
    setDeletingId(null);
    load(search);
  };

  const openCreate = () => { setEditing(null); setForm({ name: "", phone: "", notes: "" }); setErrors({}); setModalOpen(true); };
  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({ name: c.name, phone: c.phone ?? "", notes: c.notes ?? "" });
    setErrors({});
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setSaving(true);
    try {
      const url = editing ? `/api/customers/${editing.id}` : "/api/customers";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name || "", phone: form.phone, notes: form.notes }),
      });
      if (res.ok) { setModalOpen(false); load(search); }
      else { const d = await res.json(); setErrors({ form: d.error ?? "Failed" }); }
    } finally { setSaving(false); }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeader
        title={t("customers.title")}
        subtitle={`${customers.length} ${customers.length === 1 ? t("common.visit") : t("customers.title").toLowerCase()}`}
        action={<button onClick={openCreate} className="btn-primary">{t("action.newCustomer")}</button>}
      />

      <div className="mb-4">
        <input className="input max-w-sm" placeholder={t("customers.searchPlaceholder")}
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="card divide-y divide-gray-100">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="px-4 py-4 animate-pulse flex gap-4">
              <div className="w-10 h-10 bg-gray-100 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-100 rounded w-1/3" />
                <div className="h-3 bg-gray-100 rounded w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : customers.length === 0 ? (
        <EmptyState
          icon="👥"
          title={search ? t("customers.notFound") : t("customers.noCustomers")}
          description={search ? t("customers.differentSearch") : t("customers.addFirst")}
          action={!search ? <button onClick={openCreate} className="btn-primary">{t("action.newCustomer")}</button> : undefined}
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("customers.title")}</th>
                <th className="th-start px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">{t("field.phone")}</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">{t("common.visits")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-xs shrink-0">
                        {c.name[0]?.toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{c.name}</div>
                        {c.notes && <div className="text-xs text-gray-400 truncate max-w-[200px]">{c.notes}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{c.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-center text-gray-700">{c._count.visits}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/customers/${c.id}`} className="btn-secondary text-xs px-2 py-1">{t("action.view")}</Link>
                      <button onClick={() => openEdit(c)} className="btn-ghost text-xs px-2 py-1">{t("action.edit")}</button>
                      {isOwner && (
                        <button
                          onClick={() => handleDelete(c.id)}
                          disabled={deletingId === c.id}
                          className="text-red-500 hover:text-red-700 text-xs px-2 py-1 rounded hover:bg-red-50 transition-colors"
                        >
                          {deletingId === c.id ? "…" : t("action.delete")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
        title={editing ? t("customers.editCustomer") : t("customers.newCustomer")}>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="label">{t("field.name")} <span className="text-gray-400 font-normal">({t("field.optional")})</span></label>
            <input className="input" placeholder="Leave blank to auto-assign Walk-in #" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
          </div>
          <div>
            <label className="label">{t("field.phone")} <span className="text-gray-400 font-normal">({t("field.optional")})</span></label>
            <input className="input" value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <label className="label">{t("field.notes")} <span className="text-gray-400 font-normal">({t("field.optional")})</span></label>
            <textarea className="input resize-none" rows={3} value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder={t("customers.notesPlaceholder")} />
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
