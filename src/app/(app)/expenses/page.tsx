"use client";

import { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import { DateNavInput } from "@/components/ui/DateNavInput";
import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EditPinModal } from "@/components/ui/EditPinModal";
import { useTranslation } from "@/lib/i18n";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Note } from "@/components/ui/Note";

type PayMethod = "CASH" | "CARD";

interface Expense {
  id: string;
  date: string;
  amount: number;
  reason: string;
  paymentMethod: PayMethod;
  category: string | null;
  locked: boolean;
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
  const [form, setForm] = useState<{ date: string; amount: string; reason: string; paymentMethod: PayMethod }>({
    date: today,
    amount: "",
    reason: "",
    paymentMethod: "CASH",
  });
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
          // A same-day entry carries the current time, otherwise it lands at
          // midnight and falls outside the open drawer session window.
          date: form.date === today ? new Date().toISOString() : form.date,
          amount: parseFloat(form.amount),
          reason: form.reason.trim(),
          paymentMethod: form.paymentMethod,
        }),
      });
      if (res.ok) {
        setForm({ date: today, amount: "", reason: "", paymentMethod: form.paymentMethod });
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
    const res = await fetch(`/api/expenses/${id}`, { method: "DELETE" });
    setDeletingId(null);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      if (d.error === "linked_to_purchase" || d.error === "linked_to_supplier_payment") {
        alert(t("expenses.lockedDelete"));
      }
    }
    load();
  };

  const handleDelete = (id: string) => {
    if (!confirm(t("action.delete") + "?")) return;
    withPin(() => doDelete(id));
  };

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const cashTotal = expenses.filter((e) => e.paymentMethod !== "CARD").reduce((s, e) => s + e.amount, 0);
  const cardTotal = expenses.filter((e) => e.paymentMethod === "CARD").reduce((s, e) => s + e.amount, 0);

  const METHODS: { value: PayMethod; label: string; icon: IconName }[] = [
    { value: "CASH", label: t("common.cash"), icon: "banknote" },
    { value: "CARD", label: t("common.card"), icon: "card" },
  ];

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

          {/* Cash or visa — this decides which account the money leaves */}
          <div className="sm:col-span-3">
            <label className="label">{t("expenses.paidBy")}</label>
            <div className="flex gap-2">
              {METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, paymentMethod: m.value }))}
                  className={`flex-1 sm:flex-none sm:min-w-32 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    form.paymentMethod === m.value
                      ? "bg-primary-50 border-primary-300 text-primary-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Icon name={m.icon} />
                  {m.label}
                </button>
              ))}
            </div>
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

        {/* Penalties and advances have their own screens; logging them here would
            charge the day twice. */}
        <div className="mt-4">
          <Note tone="warn" title={t("note.expensesTitle")} icon="banknote">
            {t("expenses.notHereNote")}
          </Note>
        </div>
      </div>

      {/* Filter */}
      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">{t("field.from")}</label>
          <DateNavInput value={from} onChange={setFrom} />
        </div>
        <div>
          <label className="label">{t("field.to")}</label>
          <DateNavInput value={to} onChange={setTo} />
        </div>
        <button onClick={load} className="btn-primary">{t("action.filter")}</button>
      </div>

      {/* Cash vs visa split */}
      {!loading && expenses.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="card p-4">
            <div className="text-xs text-gray-500">{t("expenses.cashTotal")}</div>
            <div className="text-lg font-bold text-red-600">-{fmtCurrency(cashTotal)}</div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-gray-500">{t("expenses.cardTotal")}</div>
            <div className="text-lg font-bold text-red-600">-{fmtCurrency(cardTotal)}</div>
          </div>
        </div>
      )}

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
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("field.date")}</th>
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("field.reason")}</th>
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("expenses.paidBy")}</th>
                <th className="text-end px-4 py-3 font-medium text-gray-600">{t("expenses.amount")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {expenses.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(e.date)}</td>
                  <td className="px-4 py-3 text-gray-900">
                    {e.reason}
                    {e.locked && (
                      <span className="block text-xs text-gray-400 mt-0.5">{t("expenses.lockedHint")}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        e.paymentMethod === "CARD"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-green-50 text-green-700"
                      }`}
                    >
                      <Icon name={e.paymentMethod === "CARD" ? "card" : "banknote"} className="w-3.5 h-3.5" />
                      {e.paymentMethod === "CARD" ? t("common.card") : t("common.cash")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-end font-semibold text-red-600 whitespace-nowrap">
                    -{fmtCurrency(e.amount)}
                  </td>
                  <td className="px-4 py-3 text-end">
                    {!e.locked && (
                      <button
                        onClick={() => handleDelete(e.id)}
                        disabled={deletingId === e.id}
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        {deletingId === e.id ? "…" : t("action.delete")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td colSpan={3} className="px-4 py-3 font-semibold text-gray-700">
                  {t("expenses.totalExpenses")}
                </td>
                <td className="px-4 py-3 text-end font-bold text-red-600 text-base whitespace-nowrap">
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
