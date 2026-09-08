"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import { format, startOfMonth } from "date-fns";
import { DateNavInput } from "@/components/ui/DateNavInput";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { useTranslation } from "@/lib/i18n";

type Loc = "MAIN" | "BRANCH";

interface StockRow {
  productId: string;
  name: string;
  unit: string;
  costPrice: number;
  main: number;
  branch: number;
}

interface CountItem {
  id: string;
  productId: string;
  systemQty: number;
  countedQty: number;
  unitCost: number;
  product: { id: string; name: string; unit: string };
}

interface StockCount {
  id: string;
  date: string;
  location: Loc;
  notes: string | null;
  itemCount: number;
  differenceValue: number;
  items: CountItem[];
}

export default function StockCountPage() {
  const { t, fmtCurrency, fmtDate, fmtNumber } = useTranslation();
  const today = format(new Date(), "yyyy-MM-dd");

  const [from, setFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [to, setTo] = useState(today);

  const [counts, setCounts] = useState<StockCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [stock, setStock] = useState<StockRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<{ date: string; location: Loc; notes: string }>({
    date: today,
    location: "BRANCH",
    notes: "",
  });
  // productId -> counted quantity as typed. Blank means "not counted", so the
  // stocktake only touches what was actually looked at.
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      from: new Date(from).toISOString(),
      to: new Date(to + "T23:59:59").toISOString(),
    });
    fetch(`/api/stock/counts?${params}`)
      .then((r) => r.json())
      .then((d) => setCounts(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, [from, to]);

  const loadStock = useCallback(() => {
    fetch("/api/stock/balances")
      .then((r) => r.json())
      .then((d) => setStock(Array.isArray(d.rows) ? d.rows : []))
      .catch(() => setStock([]));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadStock(); }, [loadStock]);

  const bookQty = (row: StockRow) => (form.location === "MAIN" ? row.main : row.branch);

  const openNew = () => {
    setForm({ date: today, location: "BRANCH", notes: "" });
    setCounted({});
    setError("");
    loadStock();
    setModalOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const items = Object.entries(counted)
      .filter(([, v]) => v !== "" && Number.isFinite(parseFloat(v)))
      .map(([productId, v]) => ({ productId, countedQty: parseFloat(v) }));
    if (items.length === 0) return setError(t("stockCount.itemsRequired"));

    setSaving(true);
    try {
      const res = await fetch("/api/stock/counts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: form.date,
          location: form.location,
          notes: form.notes.trim() || undefined,
          items,
        }),
      });
      if (res.ok) {
        setModalOpen(false);
        load();
        loadStock();
      } else {
        setError((await res.json().catch(() => ({}))).error ?? "Failed");
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm(t("stockCount.deleteConfirm"))) return;
    await fetch(`/api/stock/counts/${id}`, { method: "DELETE" });
    load();
    loadStock();
  };

  const locLabel = (l: Loc) => (l === "MAIN" ? t("warehouse.mainStore") : t("warehouse.branch"));

  // Live difference while counting, valued at cost
  const draftDifference = stock.reduce((sum, row) => {
    const v = counted[row.productId];
    if (v === undefined || v === "") return sum;
    const c = parseFloat(v);
    if (!Number.isFinite(c)) return sum;
    return sum + (c - bookQty(row)) * row.costPrice;
  }, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title={t("stockCount.title")}
        subtitle={t("stockCount.subtitle")}
        action={<button onClick={openNew} className="btn-primary">{t("stockCount.newCount")}</button>}
      />

      <div className="card p-4 flex flex-wrap gap-3 items-end">
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
          {[...Array(3)].map((_, i) => <div key={i} className="card h-16 animate-pulse bg-gray-100" />)}
        </div>
      ) : counts.length === 0 ? (
        <div className="card p-8 text-center text-gray-400">
          <div className="text-3xl mb-2">🔢</div>
          <div className="text-sm">{t("stockCount.noCounts")}</div>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("field.date")}</th>
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("warehouse.location")}</th>
                <th className="text-end px-4 py-3 font-medium text-gray-600">{t("purchases.items")}</th>
                <th className="text-end px-4 py-3 font-medium text-gray-600">{t("stockCount.differenceValue")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {counts.map((c) => (
                <Fragment key={c.id}>
                  <tr
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                  >
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(c.date)}</td>
                    <td className="px-4 py-3 text-gray-700">{locLabel(c.location)}</td>
                    <td className="px-4 py-3 text-end text-gray-900">{c.itemCount}</td>
                    <td
                      className={`px-4 py-3 text-end font-semibold ${
                        c.differenceValue < 0 ? "text-red-600" : c.differenceValue > 0 ? "text-green-700" : "text-gray-500"
                      }`}
                    >
                      {fmtCurrency(c.differenceValue)}
                      <span className="text-xs font-normal text-gray-400 ms-1">
                        {c.differenceValue < 0
                          ? t("stockCount.shortage")
                          : c.differenceValue > 0
                          ? t("stockCount.surplus")
                          : t("stockCount.matched")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-end">
                      <button
                        onClick={(e) => { e.stopPropagation(); remove(c.id); }}
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        {t("action.delete")}
                      </button>
                    </td>
                  </tr>
                  {expanded === c.id && (
                    <tr className="bg-gray-50/60">
                      <td colSpan={5} className="px-6 py-3">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-500">
                              <th className="th-start py-1">{t("warehouse.productName")}</th>
                              <th className="text-end py-1">{t("stockCount.systemQty")}</th>
                              <th className="text-end py-1">{t("stockCount.countedQty")}</th>
                              <th className="text-end py-1">{t("stockCount.difference")}</th>
                              <th className="text-end py-1">{t("stockCount.differenceValue")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {c.items.map((i) => {
                              const diff = i.countedQty - i.systemQty;
                              return (
                                <tr key={i.id} className="text-gray-700">
                                  <td className="py-1">{i.product.name}</td>
                                  <td className="text-end py-1">{fmtNumber(i.systemQty)}</td>
                                  <td className="text-end py-1">{fmtNumber(i.countedQty)}</td>
                                  <td className={`text-end py-1 ${diff < 0 ? "text-red-600" : diff > 0 ? "text-green-700" : ""}`}>
                                    {fmtNumber(diff)}
                                  </td>
                                  <td className={`text-end py-1 ${diff < 0 ? "text-red-600" : diff > 0 ? "text-green-700" : ""}`}>
                                    {fmtCurrency(diff * i.unitCost)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {c.notes && <div className="text-xs text-gray-500 pt-2">{c.notes}</div>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
        {t("stockCount.notAnExpenseNote")}
      </p>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t("stockCount.newCount")} size="xl">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              <label className="label">{t("warehouse.location")}</label>
              <select
                className="input"
                value={form.location}
                onChange={(e) => setForm((p) => ({ ...p, location: e.target.value as Loc }))}
              >
                <option value="BRANCH">{t("warehouse.branch")}</option>
                <option value="MAIN">{t("warehouse.mainStore")}</option>
              </select>
            </div>
            <div>
              <label className="label">{t("field.notes")}</label>
              <input
                className="input"
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto border border-gray-200 rounded-lg">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="border-b border-gray-200">
                  <th className="th-start px-3 py-2 font-medium text-gray-600">{t("warehouse.productName")}</th>
                  <th className="text-end px-3 py-2 font-medium text-gray-600">{t("stockCount.systemQty")}</th>
                  <th className="text-end px-3 py-2 font-medium text-gray-600">{t("stockCount.countedQty")}</th>
                  <th className="text-end px-3 py-2 font-medium text-gray-600">{t("stockCount.difference")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stock.map((row) => {
                  const book = bookQty(row);
                  const raw = counted[row.productId] ?? "";
                  const diff = raw === "" ? null : parseFloat(raw) - book;
                  return (
                    <tr key={row.productId}>
                      <td className="px-3 py-2 text-gray-900">
                        {row.name}
                        <span className="text-xs text-gray-400 ms-1">{row.unit}</span>
                      </td>
                      <td className="px-3 py-2 text-end text-gray-600">{fmtNumber(book)}</td>
                      <td className="px-3 py-2 text-end">
                        <input
                          type="number"
                          step="0.01"
                          className="input py-1 text-end w-24 inline-block"
                          value={raw}
                          onChange={(e) =>
                            setCounted((p) => ({ ...p, [row.productId]: e.target.value }))
                          }
                        />
                      </td>
                      <td
                        className={`px-3 py-2 text-end font-medium ${
                          diff === null ? "text-gray-300" : diff < 0 ? "text-red-600" : diff > 0 ? "text-green-700" : "text-gray-500"
                        }`}
                      >
                        {diff === null ? "—" : fmtNumber(diff)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-gray-200 pt-3">
            <span className="text-sm font-medium text-gray-600">{t("stockCount.differenceValue")}</span>
            <span
              className={`text-lg font-bold ${
                draftDifference < 0 ? "text-red-600" : draftDifference > 0 ? "text-green-700" : "text-gray-900"
              }`}
            >
              {fmtCurrency(draftDifference)}
            </span>
          </div>

          {error && <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>}

          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>
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
