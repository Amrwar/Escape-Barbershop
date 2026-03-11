"use client";

import { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EditPinModal } from "@/components/ui/EditPinModal";
import { useTranslation } from "@/lib/i18n";

interface Expense {
  id: string;
  date: string;
  amount: number;
  reason: string;
}

export default function ExpensesPage() {
  const { t, fmtCurrency, fmtDate } = useTranslation();
  const { data: session } = useSession();
  const isOwner = session?.user?.role === "OWNER";

  const today = format(new Date(), "yyyy-MM-dd");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Add form
  const [form, setForm] = useState({ date: today, amount: "", reason: "" });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // PIN modal
  const [pinModal, setPinModal] = useState<{ open: boolean; onConfirm: () => void }>({
    open: false,
    onConfirm: () => {},
  });

  const withPin = (action: () => void) => {
    if (isOwner) { action(); return; }
    setPinModal({ open: true, onConfirm: action });
  };

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      from: new Date(from).toISOString(),
      to: new Date(to + "T23:59:59").toISOString(),
    });
    fetch(`/api/expenses?${params}`)
      .then((r) => r.json())
      .then((data) => setExpenses(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const doAdd = async () => {
    setFormError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: form.date,
          amount: parseFloat(form.amount),
          reason: form.reason.trim(),
        }),
      });
      if (res.ok) {
        setForm({ date: today, amount: "", reason: "" });
        load();
      } else {
        const d = await res.json();
        setFormError(d.error ?? "Failed");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!form.amount || parseFloat(form.amount) <= 0) {
      setFormError(t("expenses.invalidAmount"));
      return;
    }
    if (!form.reason.trim()) {
      setFormError(t("expenses.reasonRequired"));
      return;
    }
    withPin(doAdd);
  };

  const doDelete = async (id: string) => {
    setDeletingId(id);
    await fetch(`/api/expenses/${id}`, { method: "DELETE" });
    setDeletingId(null);
    load();
  };

  const handleDelete = (id: string) => {
    if (!confirm(t("action.delete") + "?")) return;
    withPin(() => doDelete(id));
  };

  const total = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeader
        title={t("expenses.title")}
        subtitle={t("expenses.subtitle")}
      />

      {/* Add expense form */}
      <div className="card p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">{t("expenses.addExpense")}</h2>
        <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="label">{t("field.date")}</label>
            <input
              type="date"
              className="input"
              value={form.date}
              onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="label">{t("expenses.amount")}</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              className="input"
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="label">{t("field.reason")}</label>
            <input
              className="input"
              placeholder={t("expenses.reasonPlaceholder")}
              value={form.reason}
              onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
              required
            />
          </div>
          {formError && (
            <div className="sm:col-span-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              {formError}
            </div>
          )}
          <div className="sm:col-span-3">
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? t("action.saving") : t("expenses.addExpense")}
            </button>
          </div>
        </form>
      </div>

      {/* Filter */}
      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">{t("field.from")}</label>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">{t("field.to")}</label>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button onClick={load} className="btn-primary">{t("action.filter")}</button>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-4 h-14 animate-pulse bg-gray-100" />
          ))}
        </div>
      ) : expenses.length === 0 ? (
        <div className="card p-8 text-center text-gray-400">
          <div className="text-3xl mb-2">💸</div>
          <div className="text-sm">{t("expenses.noExpenses")}</div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("field.date")}</th>
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("field.reason")}</th>
                <th className="text-end px-4 py-3 font-medium text-gray-600">{t("expenses.amount")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {expenses.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(e.date)}</td>
                  <td className="px-4 py-3 text-gray-900">{e.reason}</td>
                  <td className="px-4 py-3 text-end font-semibold text-red-600">
                    -{fmtCurrency(e.amount)}
                  </td>
                  <td className="px-4 py-3 text-end">
                    <button
                      onClick={() => handleDelete(e.id)}
                      disabled={deletingId === e.id}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      {deletingId === e.id ? "…" : t("action.delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td colSpan={2} className="px-4 py-3 font-semibold text-gray-700">
                  {t("expenses.totalExpenses")}
                </td>
                <td className="px-4 py-3 text-end font-bold text-red-600 text-base">
                  -{fmtCurrency(total)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <EditPinModal
        open={pinModal.open}
        onSuccess={() => { setPinModal((p) => ({ ...p, open: false })); pinModal.onConfirm(); }}
        onClose={() => setPinModal((p) => ({ ...p, open: false }))}
      />
    </div>
  );
}
