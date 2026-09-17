"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { useTranslation } from "@/lib/i18n";
import { Icon } from "@/components/ui/Icon";
import { Note } from "@/components/ui/Note";
import { ExportButton } from "@/components/ui/ExportButton";

interface StockRow {
  productId: string;
  name: string;
  unit: string;
  costPrice: number;
  salePrice: number;
  isActive: boolean;
  main: number;
  branch: number;
  total: number;
  value: number;
}

interface Totals {
  mainValue: number;
  branchValue: number;
  totalValue: number;
}

export default function WarehousePage() {
  const { t, fmtCurrency, fmtNumber } = useTranslation();

  const [rows, setRows] = useState<StockRow[]>([]);
  const [totals, setTotals] = useState<Totals>({ mainValue: 0, branchValue: 0, totalValue: 0 });
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [query, setQuery] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StockRow | null>(null);
  const [form, setForm] = useState({ name: "", unit: "pcs", costPrice: "0", salePrice: "0" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/stock/balances${showInactive ? "?includeInactive=1" : ""}`)
      .then((r) => r.json())
      .then((d) => {
        setRows(Array.isArray(d.rows) ? d.rows : []);
        setTotals(d.totals ?? { mainValue: 0, branchValue: 0, totalValue: 0 });
      })
      .finally(() => setLoading(false));
  }, [showInactive]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", unit: "pcs", costPrice: "0", salePrice: "0" });
    setError("");
    setModalOpen(true);
  };

  const openEdit = (row: StockRow) => {
    setEditing(row);
    setForm({ name: row.name, unit: row.unit, costPrice: String(row.costPrice), salePrice: String(row.salePrice ?? 0) });
    setError("");
    setModalOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(
        editing ? `/api/products/${editing.productId}` : "/api/products",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            unit: form.unit.trim() || "pcs",
            costPrice: parseFloat(form.costPrice) || 0,
            salePrice: parseFloat(form.salePrice) || 0,
          }),
        }
      );
      if (res.ok) {
        setModalOpen(false);
        load();
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error === "name_exists" ? t("warehouse.nameExists") : t("common.noData"));
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: StockRow) => {
    if (!confirm(`${t("action.delete")} ${row.name}?`)) return;
    const res = await fetch(`/api/products/${row.productId}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    if (d.deactivated) alert(t("warehouse.deactivatedNote"));
    load();
  };

  const term = query.trim().toLowerCase();
  const visible = term ? rows.filter((r) => r.name.toLowerCase().includes(term)) : rows;
  const outOfStock = rows.filter((r) => r.total <= 0).length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title={t("warehouse.title")}
        subtitle={t("warehouse.subtitle")}
        action={
          <div className="flex gap-2">
            <ExportButton
              filename="stock.xlsx"
              disabled={rows.length === 0}
              build={() => [
                {
                  name: t("warehouse.title"),
                  rows: rows.map((r) => ({
                    [t("warehouse.productName")]: r.name,
                    [t("warehouse.unit")]: r.unit,
                    [t("warehouse.mainStore")]: r.main,
                    [t("warehouse.branch")]: r.branch,
                    [t("warehouse.onHand")]: r.total,
                    [t("warehouse.costPrice")]: r.costPrice,
                    [t("warehouse.salePrice")]: r.salePrice || "—",
                    [t("warehouse.stockValue")]: r.value,
                    [t("field.status")]: r.isActive ? t("common.active") : t("common.inactive"),
                  })),
                },
              ]}
            />
            <button onClick={openNew} className="btn-primary">
              {t("warehouse.addProduct")}
            </button>
          </div>
        }
      />

      {/* Where the money is sitting right now */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-4">
          <div className="text-xs text-gray-500">{t("warehouse.mainStore")}</div>
          <div className="text-xl font-bold text-gray-900">{fmtCurrency(totals.mainValue)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-500">{t("warehouse.branch")}</div>
          <div className="text-xl font-bold text-gray-900">{fmtCurrency(totals.branchValue)}</div>
        </div>
        <div className="card p-4 bg-primary-50 border-primary-200">
          <div className="text-xs text-primary-700">{t("warehouse.totalValue")}</div>
          <div className="text-xl font-bold text-primary-800">{fmtCurrency(totals.totalValue)}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/warehouse/purchases" className="btn-secondary"><Icon name="receipt" /> {t("nav.purchases")}</Link>
        <Link href="/warehouse/suppliers" className="btn-secondary"><Icon name="truck" /> {t("nav.suppliers")}</Link>
        <Link href="/issue-notes" className="btn-secondary"><Icon name="tray-up" /> {t("nav.transfers")}</Link>
        <Link href="/warehouse/count" className="btn-secondary"><Icon name="clipboard-check" /> {t("nav.stockCount")}</Link>
      </div>

      <Note tone="rule" title={t("note.warehouseTitle")} icon="box">
        {t("note.warehouseBody")}
      </Note>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-900">
            {t("warehouse.products")}
            {outOfStock > 0 && (
              <span className="ms-2 text-xs font-medium text-red-600">
                {outOfStock} {t("warehouse.outOfStock")}
              </span>
            )}
          </h2>
          <input
            className="input max-w-56 py-1.5"
            placeholder={t("warehouse.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <label className="flex items-center gap-2 text-xs text-gray-500">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            {t("common.inactive")}
          </label>
        </div>

        {loading ? (
          <div className="p-4 space-y-2">
            {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-gray-100 animate-pulse rounded" />)}
          </div>
        ) : visible.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <div className="text-3xl mb-2">📦</div>
            <div className="text-sm">{term ? t("warehouse.noMatches") : t("warehouse.noProducts")}</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="th-start px-4 py-3 font-medium text-gray-600">{t("warehouse.productName")}</th>
                  <th className="text-end px-4 py-3 font-medium text-gray-600">{t("warehouse.mainStore")}</th>
                  <th className="text-end px-4 py-3 font-medium text-gray-600">{t("warehouse.branch")}</th>
                  <th className="text-end px-4 py-3 font-medium text-gray-600">{t("warehouse.onHand")}</th>
                  <th className="text-end px-4 py-3 font-medium text-gray-600">{t("warehouse.costPrice")}</th>
                  <th className="text-end px-4 py-3 font-medium text-gray-600">{t("warehouse.salePrice")}</th>
                  <th className="text-end px-4 py-3 font-medium text-gray-600">{t("warehouse.stockValue")}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map((r) => (
                  <tr key={r.productId} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">{r.name}</span>
                      <span className="text-xs text-gray-400 ms-2">{r.unit}</span>
                      {!r.isActive && (
                        <span className="ms-2 text-xs text-gray-400">({t("common.inactive")})</span>
                      )}
                      {r.total <= 0 && (
                        <span className="ms-2 px-1.5 py-0.5 rounded text-[11px] font-medium bg-red-50 text-red-700">
                          {r.total < 0 ? t("warehouse.negative") : t("warehouse.outOfStock")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-end text-gray-700">{fmtNumber(r.main)}</td>
                    <td className="px-4 py-3 text-end text-gray-700">{fmtNumber(r.branch)}</td>
                    <td className={`px-4 py-3 text-end font-semibold ${r.total < 0 ? "text-red-600" : "text-gray-900"}`}>
                      {fmtNumber(r.total)}
                    </td>
                    <td className="px-4 py-3 text-end text-gray-600">{fmtCurrency(r.costPrice)}</td>
                    <td className="px-4 py-3 text-end text-gray-900">
                      {r.salePrice > 0 ? fmtCurrency(r.salePrice) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-end font-medium text-gray-900">{fmtCurrency(r.value)}</td>
                    <td className="px-4 py-3 text-end whitespace-nowrap">
                      <button onClick={() => openEdit(r)} className="text-xs text-primary-600 hover:underline">
                        {t("action.edit")}
                      </button>
                      <button onClick={() => remove(r)} className="text-xs text-red-400 hover:text-red-600 ms-3">
                        {t("action.delete")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t("warehouse.editProduct") : t("warehouse.newProduct")}
        size="sm"
      >
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="label">{t("warehouse.productName")}</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t("warehouse.unit")}</label>
              <input
                className="input"
                value={form.unit}
                onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">{t("warehouse.costPrice")}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input"
                value={form.costPrice}
                onChange={(e) => setForm((p) => ({ ...p, costPrice: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">{t("warehouse.salePrice")}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input"
                value={form.salePrice}
                onChange={(e) => setForm((p) => ({ ...p, salePrice: e.target.value }))}
              />
              <p className="mt-1 text-xs text-gray-500">{t("warehouse.salePriceHint")}</p>
            </div>
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
