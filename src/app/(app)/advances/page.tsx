"use client";

import { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import { DateNavInput } from "@/components/ui/DateNavInput";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/lib/i18n";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Note } from "@/components/ui/Note";

type PayMethod = "CASH" | "CARD";

interface Advance {
  id: string;
  date: string;
  amount: number;
  paymentMethod: PayMethod;
  notes: string | null;
  barber: { id: string; name: string } | null;
}

interface Barber {
  id: string;
  name: string;
}

export default function AdvancesPage() {
  const { t, fmtCurrency, fmtDate } = useTranslation();
  const today = format(new Date(), "yyyy-MM-dd");

  const [from, setFrom] = useState(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd"));
  const [to, setTo] = useState(today);

  const [advances, setAdvances] = useState<Advance[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [form, setForm] = useState<{
    barberId: string;
    date: string;
    amount: string;
    paymentMethod: PayMethod;
    notes: string;
  }>({ barberId: "", date: today, amount: "", paymentMethod: "CASH", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      from: new Date(from).toISOString(),
      to: new Date(to + "T23:59:59").toISOString(),
    });
    fetch(`/api/advances?${params}`)
      .then((r) => r.json())
      .then((d) => setAdvances(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/barbers")
      .then((r) => r.json())
      .then((d) => setBarbers(Array.isArray(d) ? d.filter((b: Barber & { isActive?: boolean }) => b.isActive !== false) : []))
      .catch(() => setBarbers([]));
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!form.barberId) return setFormError(t("advances.barberRequired"));
    if (!form.amount || parseFloat(form.amount) <= 0) return setFormError(t("expenses.invalidAmount"));

    setSubmitting(true);
    try {
      const res = await fetch("/api/advances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barberId: form.barberId,
          // Same-day advances carry the current time so the open drawer session
          // counts them; see the expenses screen for the same rule.
          date: form.date === today ? new Date().toISOString() : form.date,
          amount: parseFloat(form.amount),
          paymentMethod: form.paymentMethod,
          notes: form.notes.trim() || null,
        }),
      });
      if (res.ok) {
        setForm((p) => ({ ...p, amount: "", notes: "" }));
        load();
      } else {
        setFormError((await res.json()).error ?? "Failed");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("action.delete") + "?")) return;
    setDeletingId(id);
    await fetch(`/api/advances/${id}`, { method: "DELETE" });
    setDeletingId(null);
    load();
  };

  const total = advances.reduce((s, a) => s + a.amount, 0);
  const METHODS: { value: PayMethod; label: string; icon: IconName }[] = [
    { value: "CASH", label: t("common.cash"), icon: "banknote" },
    { value: "CARD", label: t("common.card"), icon: "card" },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeader title={t("advances.title")} subtitle={t("advances.subtitle")} />

      <div className="card p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">{t("advances.addAdvance")}</h2>
        <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="label">{t("field.barber")}</label>
            <select
              className="input"
              value={form.barberId}
              onChange={(e) => setForm((p) => ({ ...p, barberId: e.target.value }))}
            >
              <option value="">—</option>
              {barbers.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
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
            <label className="label">{t("field.amount")}</label>
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

          <div className="sm:col-span-3">
            <label className="label">{t("field.notes")}</label>
            <input
              className="input"
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            />
          </div>

          {formError && (
            <div className="sm:col-span-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{formError}</div>
          )}

          <div className="sm:col-span-3">
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? t("action.saving") : t("advances.addAdvance")}
            </button>
          </div>
        </form>

        <div className="mt-4">
          <Note tone="info" title={t("note.advancesTitle")} icon="hand-coins">
            {t("advances.notDeductedNote")}
          </Note>
        </div>
      </div>

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

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <div key={i} className="card p-4 h-14 animate-pulse bg-gray-100" />)}
        </div>
      ) : advances.length === 0 ? (
        <div className="card p-8 text-center text-gray-400">
          <div className="text-3xl mb-2">🤝</div>
          <div className="text-sm">{t("advances.noAdvances")}</div>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("field.date")}</th>
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("field.barber")}</th>
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("expenses.paidBy")}</th>
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("field.notes")}</th>
                <th className="text-end px-4 py-3 font-medium text-gray-600">{t("field.amount")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {advances.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(a.date)}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{a.barber?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        a.paymentMethod === "CARD" ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700"
                      }`}
                    >
                      <Icon name={a.paymentMethod === "CARD" ? "card" : "banknote"} className="w-3.5 h-3.5" />
                      {a.paymentMethod === "CARD" ? t("common.card") : t("common.cash")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{a.notes ?? ""}</td>
                  <td className="px-4 py-3 text-end font-semibold text-gray-900 whitespace-nowrap">
                    {fmtCurrency(a.amount)}
                  </td>
                  <td className="px-4 py-3 text-end">
                    <button
                      onClick={() => handleDelete(a.id)}
                      disabled={deletingId === a.id}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      {deletingId === a.id ? "…" : t("action.delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td colSpan={4} className="px-4 py-3 font-semibold text-gray-700">
                  {t("advances.totalAdvances")}
                  <span className="ms-2 text-xs font-normal text-gray-400">{t("advances.recoveredIn")}</span>
                </td>
                <td className="px-4 py-3 text-end font-bold text-gray-900 text-base whitespace-nowrap">
                  {fmtCurrency(total)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
