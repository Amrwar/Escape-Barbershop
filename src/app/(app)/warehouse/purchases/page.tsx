"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import { format, startOfMonth } from "date-fns";
import { DateNavInput } from "@/components/ui/DateNavInput";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { useTranslation } from "@/lib/i18n";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Note } from "@/components/ui/Note";

type PaymentType = "CASH" | "CARD" | "CREDIT";

interface Product {
  id: string;
  name: string;
  unit: string;
  costPrice: number;
}

interface Supplier {
  id: string;
  name: string;
}

interface InvoiceItem {
  id: string;
  quantity: number;
  unitCost: number;
  total: number;
  product: { id: string; name: string; unit: string };
}

interface Invoice {
  id: string;
  number: string | null;
  date: string;
  paymentType: PaymentType;
  total: number;
  notes: string | null;
  supplier: { id: string; name: string } | null;
  items: InvoiceItem[];
}

interface Line {
  productId: string;
  quantity: string;
  unitCost: string;
}

const emptyLine = (): Line => ({ productId: "", quantity: "1", unitCost: "" });

export default function PurchasesPage() {
  const { t, fmtCurrency, fmtDate, fmtNumber } = useTranslation();
  const today = format(new Date(), "yyyy-MM-dd");

  const [from, setFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [to, setTo] = useState(today);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState({ total: 0, cash: 0, card: 0, credit: 0 });
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<{
    number: string;
    supplierId: string;
    date: string;
    paymentType: PaymentType;
    notes: string;
  }>({ number: "", supplierId: "", date: today, paymentType: "CASH", notes: "" });
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      from: new Date(from).toISOString(),
      to: new Date(to + "T23:59:59").toISOString(),
    });
    fetch(`/api/purchases?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setInvoices(Array.isArray(d.invoices) ? d.invoices : []);
        setSummary(d.summary ?? { total: 0, cash: 0, card: 0, credit: 0 });
      })
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/products").then((r) => r.json()).then((d) => setProducts(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/suppliers").then((r) => r.json()).then((d) => setSuppliers(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const openNew = () => {
    setForm({ number: "", supplierId: "", date: today, paymentType: "CASH", notes: "" });
    setLines([emptyLine()]);
    setError("");
    setModalOpen(true);
  };

  const setLine = (idx: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const pickProduct = (idx: number, productId: string) => {
    const product = products.find((p) => p.id === productId);
    setLine(idx, {
      productId,
      // Last known cost is the usual answer; the user overrides it when it changed.
      unitCost: product && !lines[idx].unitCost ? String(product.costPrice) : lines[idx].unitCost,
    });
  };

  const lineTotal = (l: Line) => (parseFloat(l.quantity) || 0) * (parseFloat(l.unitCost) || 0);
  const formTotal = lines.reduce((s, l) => s + lineTotal(l), 0);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const items = lines
      .filter((l) => l.productId && parseFloat(l.quantity) > 0)
      .map((l) => ({
        productId: l.productId,
        quantity: parseFloat(l.quantity),
        unitCost: parseFloat(l.unitCost) || 0,
      }));
    if (items.length === 0) return setError(t("purchases.itemsRequired"));

    setSaving(true);
    try {
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: form.number.trim() || undefined,
          supplierId: form.supplierId || null,
          date: form.date,
          paymentType: form.paymentType,
          notes: form.notes.trim() || undefined,
          items,
        }),
      });
      if (res.ok) {
        setModalOpen(false);
        load();
      } else {
        setError((await res.json().catch(() => ({}))).error ?? "Failed");
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm(t("purchases.deleteConfirm"))) return;
    await fetch(`/api/purchases/${id}`, { method: "DELETE" });
    load();
  };

  const PAYMENT_TYPES: { value: PaymentType; label: string; icon: IconName }[] = [
    { value: "CASH", label: t("common.cash"), icon: "banknote" },
    { value: "CARD", label: t("common.card"), icon: "card" },
    { value: "CREDIT", label: t("common.credit"), icon: "receipt" },
  ];

  const badge = (type: PaymentType) => {
    const style =
      type === "CASH"
        ? "bg-green-50 text-green-700"
        : type === "CARD"
        ? "bg-blue-50 text-blue-700"
        : "bg-amber-50 text-amber-700";
    const label = type === "CASH" ? t("common.cash") : type === "CARD" ? t("common.card") : t("common.credit");
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${style}`}>{label}</span>;
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title={t("purchases.title")}
        subtitle={t("purchases.subtitle")}
        action={<button onClick={openNew} className="btn-primary">{t("purchases.newInvoice")}</button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-4">
          <div className="text-xs text-gray-500">{t("purchases.invoiceTotal")}</div>
          <div className="text-lg font-bold text-gray-900">{fmtCurrency(summary.total)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-500">{t("purchases.cashTotal")}</div>
          <div className="text-lg font-bold text-green-700">{fmtCurrency(summary.cash)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-500">{t("purchases.cardTotal")}</div>
          <div className="text-lg font-bold text-blue-700">{fmtCurrency(summary.card)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-500">{t("purchases.creditTotal")}</div>
          <div className="text-lg font-bold text-amber-700">{fmtCurrency(summary.credit)}</div>
        </div>
      </div>

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
      ) : invoices.length === 0 ? (
        <div className="card p-8 text-center text-gray-400">
          <div className="text-3xl mb-2">🧾</div>
          <div className="text-sm">{t("purchases.noInvoices")}</div>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("field.date")}</th>
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("purchases.invoiceNo")}</th>
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("purchases.supplier")}</th>
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("purchases.paymentType")}</th>
                <th className="text-end px-4 py-3 font-medium text-gray-600">{t("field.total")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.map((inv) => (
                <Fragment key={inv.id}>
                  <tr
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
                  >
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(inv.date)}</td>
                    <td className="px-4 py-3 text-gray-900">{inv.number ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-900">{inv.supplier?.name ?? t("purchases.noSupplier")}</td>
                    <td className="px-4 py-3">{badge(inv.paymentType)}</td>
                    <td className="px-4 py-3 text-end font-semibold text-gray-900 whitespace-nowrap">
                      {fmtCurrency(inv.total)}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <button
                        onClick={(e) => { e.stopPropagation(); remove(inv.id); }}
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        {t("action.delete")}
                      </button>
                    </td>
                  </tr>
                  {expanded === inv.id && (
                    <tr className="bg-gray-50/60">
                      <td colSpan={6} className="px-6 py-3">
                        <div className="space-y-1">
                          {inv.items.map((it) => (
                            <div key={it.id} className="flex justify-between text-xs text-gray-600">
                              <span>
                                {it.product.name}
                                <span className="text-gray-400">
                                  {" "}× {fmtNumber(it.quantity)} {it.product.unit} @ {fmtCurrency(it.unitCost)}
                                </span>
                              </span>
                              <span className="font-medium text-gray-800">{fmtCurrency(it.total)}</span>
                            </div>
                          ))}
                          {inv.notes && <div className="text-xs text-gray-500 pt-1">{inv.notes}</div>}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Note tone="rule" title={t("purchases.paymentType")} icon="receipt">
        {t("purchases.postedNote")}
      </Note>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t("purchases.newInvoice")} size="xl">
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
              <label className="label">{t("purchases.invoiceNo")}</label>
              <input
                className="input"
                value={form.number}
                onChange={(e) => setForm((p) => ({ ...p, number: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">{t("purchases.supplier")}</label>
              <select
                className="input"
                value={form.supplierId}
                onChange={(e) => setForm((p) => ({ ...p, supplierId: e.target.value }))}
              >
                <option value="">{t("purchases.noSupplier")}</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">{t("purchases.paymentType")}</label>
            <div className="flex gap-2">
              {PAYMENT_TYPES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, paymentType: p.value }))}
                  className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    form.paymentType === p.value
                      ? "bg-primary-50 border-primary-300 text-primary-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Icon name={p.icon} />
                  {p.label}
                </button>
              ))}
            </div>
            {form.paymentType === "CREDIT" && (
              <p className="text-xs text-amber-700 mt-2">{t("purchases.postedNote")}</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">{t("purchases.items")}</label>
              <button
                type="button"
                onClick={() => setLines((p) => [...p, emptyLine()])}
                className="text-xs text-primary-600 hover:underline"
              >
                {t("purchases.addItem")}
              </button>
            </div>

            <div className="space-y-2">
              {lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <select
                    className="input col-span-5"
                    value={line.productId}
                    onChange={(e) => pickProduct(idx, e.target.value)}
                  >
                    <option value="">—</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input col-span-2"
                    placeholder={t("field.quantity")}
                    value={line.quantity}
                    onChange={(e) => setLine(idx, { quantity: e.target.value })}
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input col-span-2"
                    placeholder={t("purchases.unitCost")}
                    value={line.unitCost}
                    onChange={(e) => setLine(idx, { unitCost: e.target.value })}
                  />
                  <div className="col-span-2 text-end text-sm font-medium text-gray-700">
                    {fmtCurrency(lineTotal(line))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setLines((p) => (p.length === 1 ? p : p.filter((_, i) => i !== idx)))}
                    className="col-span-1 text-red-400 hover:text-red-600 text-lg leading-none"
                    aria-label={t("action.delete")}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="label">{t("field.notes")}</label>
            <input
              className="input"
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            />
          </div>

          <div className="flex items-center justify-between border-t border-gray-200 pt-3">
            <span className="text-sm font-medium text-gray-600">{t("purchases.invoiceTotal")}</span>
            <span className="text-lg font-bold text-gray-900">{fmtCurrency(formTotal)}</span>
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
