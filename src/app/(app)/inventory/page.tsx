"use client";

import { useEffect, useState, useCallback } from "react";
import { format, startOfMonth, startOfYear, endOfDay } from "date-fns";
import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { useTranslation } from "@/lib/i18n";

interface Product {
  id: string;
  name: string;
  unit: string;
  isActive: boolean;
}

interface UsageEntry {
  id: string;
  productId: string;
  quantity: number;
  date: string;
  notes: string | null;
  product: { name: string; unit: string };
}

type Period = "today" | "month" | "year" | "custom";

function getPeriodRange(period: Period, customFrom: string, customTo: string) {
  const today = new Date();
  if (period === "today") {
    return {
      from: format(today, "yyyy-MM-dd"),
      to: format(today, "yyyy-MM-dd"),
    };
  }
  if (period === "month") {
    return {
      from: format(startOfMonth(today), "yyyy-MM-dd"),
      to: format(today, "yyyy-MM-dd"),
    };
  }
  if (period === "year") {
    return {
      from: format(startOfYear(today), "yyyy-MM-dd"),
      to: format(today, "yyyy-MM-dd"),
    };
  }
  return { from: customFrom, to: customTo };
}

export default function InventoryPage() {
  const { data: authSession } = useSession();
  const isOwner = authSession?.user?.role === "OWNER";
  const { t, fmtDate } = useTranslation();

  const today = format(new Date(), "yyyy-MM-dd");

  const [period, setPeriod] = useState<Period>("today");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);

  const [products, setProducts] = useState<Product[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [usages, setUsages] = useState<UsageEntry[]>([]);
  const [loadingUsages, setLoadingUsages] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Log usage form
  const [logForm, setLogForm] = useState({ productId: "", quantity: "", date: today, notes: "" });
  const [logSubmitting, setLogSubmitting] = useState(false);
  const [logError, setLogError] = useState("");

  // Product management
  const [productModal, setProductModal] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState({ name: "", unit: "" });
  const [productSubmitting, setProductSubmitting] = useState(false);
  const [productError, setProductError] = useState("");

  const fetchProducts = useCallback(async () => {
    const [active, all] = await Promise.all([
      fetch("/api/inventory").then((r) => r.json()),
      fetch("/api/inventory?all=true").then((r) => r.json()),
    ]);
    setProducts(Array.isArray(active) ? active : []);
    setAllProducts(Array.isArray(all) ? all : []);
  }, []);

  const fetchUsages = useCallback(async () => {
    setLoadingUsages(true);
    const { from, to } = getPeriodRange(period, customFrom, customTo);
    const params = new URLSearchParams({
      from: new Date(from).toISOString(),
      to: endOfDay(new Date(to)).toISOString(),
    });
    const data = await fetch(`/api/inventory/usage?${params}`).then((r) => r.json());
    setUsages(Array.isArray(data) ? data : []);
    setLoadingUsages(false);
  }, [period, customFrom, customTo]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    fetchUsages();
  }, [fetchUsages]);

  const handleLogUsage = async (e: React.FormEvent) => {
    e.preventDefault();
    setLogError("");
    if (!logForm.productId) { setLogError(t("inventory.selectProductError")); return; }
    if (!logForm.quantity || parseFloat(logForm.quantity) <= 0) { setLogError(t("inventory.qtyError")); return; }
    setLogSubmitting(true);
    try {
      const res = await fetch("/api/inventory/usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: logForm.productId,
          quantity: parseFloat(logForm.quantity),
          date: logForm.date,
          notes: logForm.notes,
        }),
      });
      if (res.ok) {
        setLogForm({ productId: "", quantity: "", date: today, notes: "" });
        fetchUsages();
      } else {
        const d = await res.json();
        setLogError(d.error ?? "Failed");
      }
    } finally {
      setLogSubmitting(false);
    }
  };

  const handleDeleteUsage = async (id: string) => {
    if (!confirm(t("action.delete") + "?")) return;
    setDeletingId(id);
    await fetch(`/api/inventory/usage/${id}`, { method: "DELETE" });
    setDeletingId(null);
    fetchUsages();
  };

  const openAddProduct = () => {
    setEditProduct(null);
    setProductForm({ name: "", unit: "" });
    setProductError("");
    setProductModal(true);
  };

  const openEditProduct = (p: Product) => {
    setEditProduct(p);
    setProductForm({ name: p.name, unit: p.unit });
    setProductError("");
    setProductModal(true);
  };

  const handleProductSubmit = async () => {
    setProductError("");
    if (!productForm.name.trim()) { setProductError(t("inventory.nameRequired")); return; }
    setProductSubmitting(true);
    try {
      const url = editProduct ? `/api/inventory/${editProduct.id}` : "/api/inventory";
      const method = editProduct ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: productForm.name, unit: productForm.unit || "pcs" }),
      });
      if (res.ok) {
        setProductModal(false);
        fetchProducts();
      } else {
        const d = await res.json();
        setProductError(d.error ?? "Failed");
      }
    } finally {
      setProductSubmitting(false);
    }
  };

  const handleToggleProduct = async (p: Product) => {
    await fetch(`/api/inventory/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !p.isActive }),
    });
    fetchProducts();
  };

  const handleDeleteProduct = async (p: Product) => {
    if (!confirm(t("action.delete") + "?")) return;
    await fetch(`/api/inventory/${p.id}`, { method: "DELETE" });
    fetchProducts();
  };

  // Summarize usage by product
  const summary = usages.reduce<Record<string, { name: string; unit: string; total: number }>>(
    (acc, u) => {
      if (!acc[u.productId]) {
        acc[u.productId] = { name: u.product.name, unit: u.product.unit, total: 0 };
      }
      acc[u.productId].total += u.quantity;
      return acc;
    },
    {}
  );
  const summaryEntries = Object.values(summary).sort((a, b) => b.total - a.total);

  const PERIODS: { key: Period; label: string }[] = [
    { key: "today", label: t("inventory.today") },
    { key: "month", label: t("inventory.thisMonth") },
    { key: "year", label: t("inventory.thisYear") },
    { key: "custom", label: t("inventory.custom") },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <PageHeader title={t("inventory.title")} subtitle={t("inventory.subtitle")} />

      {/* Period selector */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-2 mb-3">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                period === p.key
                  ? "bg-primary-50 border-primary-300 text-primary-700"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="label">{t("field.from")}</label>
              <input type="date" className="input" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </div>
            <div>
              <label className="label">{t("field.to")}</label>
              <input type="date" className="input" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
            <button onClick={fetchUsages} className="btn-primary">{t("action.filter")}</button>
          </div>
        )}
      </div>

      {/* Usage summary */}
      {summaryEntries.length > 0 && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">{t("inventory.usageSummary")}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {summaryEntries.map((s) => (
              <div key={s.name} className="bg-gray-50 rounded-lg px-4 py-3">
                <div className="text-xs text-gray-500 truncate">{s.name}</div>
                <div className="text-lg font-bold text-gray-900">
                  {s.total % 1 === 0 ? s.total : s.total.toFixed(2)}
                  <span className="text-xs font-normal text-gray-400 ms-1">{s.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Log usage form */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">{t("inventory.logUsage")}</h2>
        {products.length === 0 ? (
          <p className="text-sm text-gray-400">{t("inventory.noProductsHint")}</p>
        ) : (
          <form onSubmit={handleLogUsage} className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <div>
              <label className="label">{t("inventory.product")}</label>
              <select
                className="input"
                value={logForm.productId}
                onChange={(e) => setLogForm((p) => ({ ...p, productId: e.target.value }))}
                required
              >
                <option value="">{t("inventory.selectProduct")}</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.unit})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{t("inventory.usageQty")}</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                className="input"
                placeholder="0"
                value={logForm.quantity}
                onChange={(e) => setLogForm((p) => ({ ...p, quantity: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="label">{t("field.date")}</label>
              <input
                type="date"
                className="input"
                value={logForm.date}
                onChange={(e) => setLogForm((p) => ({ ...p, date: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="label">
                {t("field.notes")} <span className="text-gray-400 font-normal">({t("field.optional")})</span>
              </label>
              <input
                className="input"
                value={logForm.notes}
                onChange={(e) => setLogForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>
            {logError && (
              <div className="sm:col-span-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                {logError}
              </div>
            )}
            <div className="sm:col-span-2">
              <button type="submit" disabled={logSubmitting} className="btn-primary">
                {logSubmitting ? t("action.saving") : t("inventory.logUsage")}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Usage log */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">{t("inventory.usageLog")}</h2>
        </div>
        {loadingUsages ? (
          <div className="space-y-2 p-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : usages.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">{t("inventory.noUsage")}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("field.date")}</th>
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("inventory.product")}</th>
                <th className="text-end px-4 py-3 font-medium text-gray-600">{t("inventory.usageQty")}</th>
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("field.notes")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {usages.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(u.date)}</td>
                  <td className="px-4 py-3 text-gray-900 font-medium">{u.product.name}</td>
                  <td className="px-4 py-3 text-end font-semibold text-gray-900">
                    {u.quantity % 1 === 0 ? u.quantity : u.quantity.toFixed(2)}
                    <span className="text-xs font-normal text-gray-400 ms-1">{u.product.unit}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{u.notes ?? "—"}</td>
                  <td className="px-4 py-3 text-end">
                    <button
                      onClick={() => handleDeleteUsage(u.id)}
                      disabled={deletingId === u.id}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      {deletingId === u.id ? "…" : t("action.delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Products management (owner only) */}
      {isOwner && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">{t("inventory.products")}</h2>
            <button onClick={openAddProduct} className="btn-primary text-sm">
              {t("inventory.addProduct")}
            </button>
          </div>
          {allProducts.length === 0 ? (
            <p className="text-sm text-gray-400">{t("inventory.noProducts")}</p>
          ) : (
            <div className="space-y-2">
              {allProducts.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        p.isActive
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      {p.isActive ? t("common.active") : t("common.inactive")}
                    </span>
                    <span className="text-sm font-medium text-gray-900">{p.name}</span>
                    <span className="text-xs text-gray-400">({p.unit})</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => openEditProduct(p)}
                      className="text-xs text-primary-600 hover:text-primary-800"
                    >
                      {t("action.edit")}
                    </button>
                    <button
                      onClick={() => handleToggleProduct(p)}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      {p.isActive ? t("action.deactivate") : t("action.activate")}
                    </button>
                    <button
                      onClick={() => handleDeleteProduct(p)}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      {t("action.delete")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add/Edit product modal */}
      <Modal
        open={productModal}
        onClose={() => setProductModal(false)}
        title={editProduct ? t("inventory.editProduct") : t("inventory.addProduct")}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="label">{t("field.name")}</label>
            <input
              className="input"
              value={productForm.name}
              onChange={(e) => setProductForm((p) => ({ ...p, name: e.target.value }))}
              placeholder={t("inventory.productNamePlaceholder")}
              autoFocus
            />
          </div>
          <div>
            <label className="label">{t("inventory.unit")}</label>
            <input
              className="input"
              value={productForm.unit}
              onChange={(e) => setProductForm((p) => ({ ...p, unit: e.target.value }))}
              placeholder={t("inventory.unitPlaceholder")}
            />
          </div>
          {productError && <p className="text-sm text-red-600">{productError}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={() => setProductModal(false)} className="btn-secondary flex-1">
              {t("action.cancel")}
            </button>
            <button
              type="button"
              onClick={handleProductSubmit}
              disabled={productSubmitting}
              className="btn-primary flex-1"
            >
              {productSubmitting ? t("action.saving") : t("action.save")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
