"use client";

import { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { useTranslation } from "@/lib/i18n";
import { Icon } from "@/components/ui/Icon";
import { Note } from "@/components/ui/Note";
import { ExportButton } from "@/components/ui/ExportButton";

type PayMethod = "CASH" | "CARD";

interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  isActive: boolean;
  invoiceCount: number;
  creditTotal: number;
  paidTotal: number;
  balance: number;
}

interface StatementInvoice {
  id: string;
  number: string | null;
  date: string;
  paymentType: "CASH" | "CARD" | "CREDIT";
  total: number;
}

interface StatementPayment {
  id: string;
  date: string;
  amount: number;
  paymentMethod: PayMethod;
  notes: string | null;
}

interface Statement {
  id: string;
  name: string;
  invoices: StatementInvoice[];
  payments: StatementPayment[];
  creditTotal: number;
  paidTotal: number;
  balance: number;
}

export default function SuppliersPage() {
  const { t, fmtCurrency, fmtDate } = useTranslation();
  const today = format(new Date(), "yyyy-MM-dd");

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  const [editModal, setEditModal] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [payModal, setPayModal] = useState<Supplier | null>(null);
  const [payForm, setPayForm] = useState<{ date: string; amount: string; paymentMethod: PayMethod; notes: string }>({
    date: today,
    amount: "",
    paymentMethod: "CASH",
    notes: "",
  });

  const [statement, setStatement] = useState<Statement | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/suppliers?includeInactive=1")
      .then((r) => r.json())
      .then((d) => setSuppliers(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", phone: "", notes: "" });
    setError("");
    setEditModal(true);
  };

  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({ name: s.name, phone: s.phone ?? "", notes: s.notes ?? "" });
    setError("");
    setEditModal(true);
  };

  const saveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(editing ? `/api/suppliers/${editing.id}` : "/api/suppliers", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim(), phone: form.phone.trim(), notes: form.notes.trim() }),
      });
      if (res.ok) {
        setEditModal(false);
        load();
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error === "name_exists" ? t("suppliers.nameExists") : "Failed");
      }
    } finally {
      setSaving(false);
    }
  };

  const savePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModal || !payForm.amount || parseFloat(payForm.amount) <= 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/supplier-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: payModal.id,
          date: payForm.date,
          amount: parseFloat(payForm.amount),
          paymentMethod: payForm.paymentMethod,
          notes: payForm.notes.trim() || undefined,
        }),
      });
      if (res.ok) {
        setPayModal(null);
        setPayForm({ date: today, amount: "", paymentMethod: "CASH", notes: "" });
        load();
      }
    } finally {
      setSaving(false);
    }
  };

  const openStatement = async (s: Supplier) => {
    const data = await fetch(`/api/suppliers/${s.id}`).then((r) => r.json());
    if (!data?.error) setStatement(data);
  };

  const totalBalance = suppliers.reduce((sum, s) => sum + s.balance, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title={t("suppliers.title")}
        subtitle={t("suppliers.subtitle")}
        action={
          <div className="flex gap-2">
            <ExportButton
              filename="suppliers.xlsx"
              disabled={suppliers.length === 0}
              build={() => [
                {
                  name: t("suppliers.title"),
                  rows: suppliers.map((s) => ({
                    [t("field.name")]: s.name,
                    [t("field.phone")]: s.phone ?? "",
                    [t("suppliers.creditTotal")]: s.creditTotal,
                    [t("suppliers.paidTotal")]: s.paidTotal,
                    [t("suppliers.balance")]: s.balance,
                    [t("field.status")]: s.isActive ? t("common.active") : t("common.inactive"),
                  })),
                },
              ]}
            />
            <button onClick={openNew} className="btn-primary">{t("suppliers.addSupplier")}</button>
          </div>
        }
      />

      <Note tone="rule" title={t("note.suppliersTitle")} icon="truck">
        {t("note.suppliersBody")}
      </Note>

      <div className="card p-4">
        <div className="text-xs text-gray-500">{t("suppliers.balance")}</div>
        <div className={`text-xl font-bold ${totalBalance > 0 ? "text-amber-700" : "text-gray-900"}`}>
          {fmtCurrency(totalBalance)}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <div key={i} className="card h-16 animate-pulse bg-gray-100" />)}
        </div>
      ) : suppliers.length === 0 ? (
        <div className="card p-8 text-center text-gray-400">
          <div className="text-3xl mb-2">🚚</div>
          <div className="text-sm">{t("suppliers.noSuppliers")}</div>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("field.name")}</th>
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("field.phone")}</th>
                <th className="text-end px-4 py-3 font-medium text-gray-600">{t("suppliers.creditTotal")}</th>
                <th className="text-end px-4 py-3 font-medium text-gray-600">{t("suppliers.paidTotal")}</th>
                <th className="text-end px-4 py-3 font-medium text-gray-600">{t("suppliers.balance")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {suppliers.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <button onClick={() => openStatement(s)} className="font-medium text-gray-900 hover:text-primary-600">
                      {s.name}
                    </button>
                    {!s.isActive && <span className="ms-2 text-xs text-gray-400">({t("common.inactive")})</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{s.phone ?? ""}</td>
                  <td className="px-4 py-3 text-end text-gray-700">{fmtCurrency(s.creditTotal)}</td>
                  <td className="px-4 py-3 text-end text-gray-700">{fmtCurrency(s.paidTotal)}</td>
                  <td className={`px-4 py-3 text-end font-semibold ${s.balance > 0 ? "text-amber-700" : "text-gray-500"}`}>
                    {fmtCurrency(s.balance)}
                  </td>
                  <td className="px-4 py-3 text-end whitespace-nowrap">
                    <button onClick={() => setPayModal(s)} className="text-xs text-primary-600 hover:underline">
                      {t("suppliers.pay")}
                    </button>
                    <button onClick={() => openEdit(s)} className="text-xs text-gray-500 hover:text-gray-800 ms-3">
                      {t("action.edit")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / edit supplier */}
      <Modal
        open={editModal}
        onClose={() => setEditModal(false)}
        title={editing ? t("suppliers.editSupplier") : t("suppliers.newSupplier")}
        size="sm"
      >
        <form onSubmit={saveSupplier} className="space-y-4">
          <div>
            <label className="label">{t("field.name")}</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="label">{t("field.phone")}</label>
            <input
              className="input"
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">{t("field.notes")}</label>
            <input
              className="input"
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            />
          </div>
          {error && <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>}
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-secondary" onClick={() => setEditModal(false)}>
              {t("action.cancel")}
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? t("action.saving") : t("action.save")}
            </button>
          </div>
        </form>
      </Modal>

      {/* Record a payment against the account */}
      <Modal open={Boolean(payModal)} onClose={() => setPayModal(null)} title={t("suppliers.payTitle")} size="sm">
        <form onSubmit={savePayment} className="space-y-4">
          <div className="text-sm text-gray-600">
            {payModal?.name}
            <span className="ms-2 font-semibold text-amber-700">{fmtCurrency(payModal?.balance ?? 0)}</span>
          </div>
          <div>
            <label className="label">{t("field.date")}</label>
            <input
              type="date"
              className="input"
              value={payForm.date}
              onChange={(e) => setPayForm((p) => ({ ...p, date: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="label">{t("field.amount")}</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              className="input"
              value={payForm.amount}
              onChange={(e) => setPayForm((p) => ({ ...p, amount: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="label">{t("expenses.paidBy")}</label>
            <div className="flex gap-2">
              {(["CASH", "CARD"] as PayMethod[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPayForm((p) => ({ ...p, paymentMethod: m }))}
                  className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    payForm.paymentMethod === m
                      ? "bg-primary-50 border-primary-300 text-primary-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Icon name={m === "CASH" ? "banknote" : "card"} />
                  {m === "CASH" ? t("common.cash") : t("common.card")}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">{t("field.notes")}</label>
            <input
              className="input"
              value={payForm.notes}
              onChange={(e) => setPayForm((p) => ({ ...p, notes: e.target.value }))}
            />
          </div>
          <p className="text-xs text-gray-500">{t("suppliers.paymentNote")}</p>
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-secondary" onClick={() => setPayModal(null)}>
              {t("action.cancel")}
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? t("action.saving") : t("action.save")}
            </button>
          </div>
        </form>
      </Modal>

      {/* Account statement */}
      <Modal
        open={Boolean(statement)}
        onClose={() => setStatement(null)}
        title={`${t("suppliers.statement")} — ${statement?.name ?? ""}`}
        size="xl"
      >
        {statement && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="card p-3">
                <div className="text-xs text-gray-500">{t("suppliers.creditTotal")}</div>
                <div className="font-bold text-gray-900">{fmtCurrency(statement.creditTotal)}</div>
              </div>
              <div className="card p-3">
                <div className="text-xs text-gray-500">{t("suppliers.paidTotal")}</div>
                <div className="font-bold text-gray-900">{fmtCurrency(statement.paidTotal)}</div>
              </div>
              <div className="card p-3">
                <div className="text-xs text-gray-500">{t("suppliers.balance")}</div>
                <div className="font-bold text-amber-700">{fmtCurrency(statement.balance)}</div>
              </div>
            </div>

            {statement.invoices.length === 0 && statement.payments.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-6">{t("suppliers.noMovements")}</div>
            ) : (
              <>
                {statement.invoices.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">{t("suppliers.invoices")}</h3>
                    <div className="space-y-1">
                      {statement.invoices.map((i) => (
                        <div key={i.id} className="flex justify-between text-sm border-b border-gray-100 py-1.5">
                          <span className="text-gray-600">
                            {fmtDate(i.date)}
                            {i.number ? ` · ${i.number}` : ""}
                            <span className="text-xs text-gray-400 ms-2">
                              {i.paymentType === "CREDIT"
                                ? t("common.credit")
                                : i.paymentType === "CARD"
                                ? t("common.card")
                                : t("common.cash")}
                            </span>
                          </span>
                          <span className="font-medium text-gray-900">{fmtCurrency(i.total)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {statement.payments.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">{t("suppliers.payments")}</h3>
                    <div className="space-y-1">
                      {statement.payments.map((p) => (
                        <div key={p.id} className="flex justify-between text-sm border-b border-gray-100 py-1.5">
                          <span className="text-gray-600">
                            {fmtDate(p.date)}
                            <span className="text-xs text-gray-400 ms-2">
                              {p.paymentMethod === "CARD" ? t("common.card") : t("common.cash")}
                            </span>
                          </span>
                          <span className="font-medium text-green-700">-{fmtCurrency(p.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
