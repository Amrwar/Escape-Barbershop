"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import { format, startOfMonth } from "date-fns";
import { useSession } from "next-auth/react";
import { DateNavInput } from "@/components/ui/DateNavInput";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { useTranslation } from "@/lib/i18n";

type Loc = "MAIN" | "BRANCH";

interface StockRow {
  productId: string;
  name: string;
  unit: string;
  main: number;
  branch: number;
}

interface TransferItem {
  id: string;
  quantity: number;
  product: { id: string; name: string; unit: string };
}

interface Transfer {
  id: string;
  number: string | null;
  date: string;
  fromLocation: Loc;
  toLocation: Loc;
  notes: string | null;
  items: TransferItem[];
}

interface Line {
  productId: string;
  quantity: string;
}

const emptyLine = (): Line => ({ productId: "", quantity: "1" });

export default function IssueNotesPage() {
  const { t, fmtDate, fmtNumber } = useTranslation();
  const { data: session } = useSession();
  const isOwner = session?.user?.role === "OWNER";
  const today = format(new Date(), "yyyy-MM-dd");

  const [from, setFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [to, setTo] = useState(today);

  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<{ number: string; date: string; fromLocation: Loc; toLocation: Loc; notes: string }>({
    number: "",
    date: today,
    fromLocation: "MAIN",
    toLocation: "BRANCH",
    notes: "",
  });
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      from: new Date(from).toISOString(),
      to: new Date(to + "T23:59:59").toISOString(),
    });
    fetch(`/api/stock/transfers?${params}`)
      .then((r) => r.json())
      .then((d) => setTransfers(Array.isArray(d) ? d : []))
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

  const available = (productId: string) => {
    const row = stock.find((s) => s.productId === productId);
    if (!row) return 0;
    return form.fromLocation === "MAIN" ? row.main : row.branch;
  };

  const openNew = () => {
    setForm({ number: "", date: today, fromLocation: "MAIN", toLocation: "BRANCH", notes: "" });
    setLines([emptyLine()]);
    setError("");
    setModalOpen(true);
  };

  const setLine = (idx: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (form.fromLocation === form.toLocation) return setError(t("transfers.sameLocation"));

    const items = lines
      .filter((l) => l.productId && parseFloat(l.quantity) > 0)
      .map((l) => ({ productId: l.productId, quantity: parseFloat(l.quantity) }));
    if (items.length === 0) return setError(t("transfers.itemsRequired"));

    setSaving(true);
    try {
      const res = await fetch("/api/stock/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: form.number.trim() || undefined,
          date: form.date,
          fromLocation: form.fromLocation,
          toLocation: form.toLocation,
          notes: form.notes.trim() || undefined,
          items,
        }),
      });
      if (res.ok) {
        setModalOpen(false);
        load();
        loadStock();
      } else {
        const d = await res.json().catch(() => ({}));
        if (d.error === "insufficient_stock") {
          const detail = (d.short ?? [])
            .map((s: { name: string; available: number; requested: number }) => `${s.name}: ${s.available}`)
            .join(", ");
          setError(`${t("transfers.insufficient")} — ${detail}`);
        } else if (d.error === "same_location") {
          setError(t("transfers.sameLocation"));
        } else {
          setError("Failed");
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm(t("transfers.deleteConfirm"))) return;
    await fetch(`/api/stock/transfers/${id}`, { method: "DELETE" });
    load();
    loadStock();
  };

  const locLabel = (l: Loc) => (l === "MAIN" ? t("warehouse.mainStore") : t("warehouse.branch"));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title={t("transfers.title")}
        subtitle={t("transfers.subtitle")}
        action={<button onClick={openNew} className="btn-primary">{t("transfers.newTransfer")}</button>}
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
      ) : transfers.length === 0 ? (
        <div className="card p-8 text-center text-gray-400">
          <div className="text-3xl mb-2">📤</div>
          <div className="text-sm">{t("transfers.noTransfers")}</div>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("field.date")}</th>
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("transfers.noteNo")}</th>
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("field.from")}</th>
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("field.to")}</th>
                <th className="text-end px-4 py-3 font-medium text-gray-600">{t("purchases.items")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transfers.map((tr) => (
                <Fragment key={tr.id}>
                  <tr
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setExpanded(expanded === tr.id ? null : tr.id)}
                  >
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(tr.date)}</td>
                    <td className="px-4 py-3 text-gray-900">{tr.number ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-700">{locLabel(tr.fromLocation)}</td>
                    <td className="px-4 py-3 text-gray-700">{locLabel(tr.toLocation)}</td>
                    <td className="px-4 py-3 text-end text-gray-900 font-medium">{tr.items.length}</td>
                    <td className="px-4 py-3 text-end">
                      {isOwner && (
                        <button
                          onClick={(e) => { e.stopPropagation(); remove(tr.id); }}
                          className="text-xs text-red-400 hover:text-red-600"
                        >
                          {t("action.delete")}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded === tr.id && (
                    <tr className="bg-gray-50/60">
                      <td colSpan={6} className="px-6 py-3">
                        <div className="space-y-1">
                          {tr.items.map((it) => (
                            <div key={it.id} className="flex justify-between text-xs text-gray-600">
                              <span>{it.product.name}</span>
                              <span className="font-medium text-gray-800">
                                {fmtNumber(it.quantity)} {it.product.unit}
                              </span>
                            </div>
                          ))}
                          {tr.notes && <div className="text-xs text-gray-500 pt-1">{tr.notes}</div>}
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t("transfers.newTransfer")} size="xl">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
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
              <label className="label">{t("transfers.noteNo")}</label>
              <input
                className="input"
                value={form.number}
                onChange={(e) => setForm((p) => ({ ...p, number: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">{t("field.from")}</label>
              <select
                className="input"
                value={form.fromLocation}
                onChange={(e) => setForm((p) => ({ ...p, fromLocation: e.target.value as Loc }))}
              >
                <option value="MAIN">{t("warehouse.mainStore")}</option>
                <option value="BRANCH">{t("warehouse.branch")}</option>
              </select>
            </div>
            <div>
              <label className="label">{t("field.to")}</label>
              <select
                className="input"
                value={form.toLocation}
                onChange={(e) => setForm((p) => ({ ...p, toLocation: e.target.value as Loc }))}
              >
                <option value="BRANCH">{t("warehouse.branch")}</option>
                <option value="MAIN">{t("warehouse.mainStore")}</option>
              </select>
            </div>
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
              {lines.map((line, idx) => {
                const avail = available(line.productId);
                const over = line.productId !== "" && parseFloat(line.quantity) > avail;
                return (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <select
                      className="input col-span-6"
                      value={line.productId}
                      onChange={(e) => setLine(idx, { productId: e.target.value })}
                    >
                      <option value="">—</option>
                      {stock.map((s) => (
                        <option key={s.productId} value={s.productId}>{s.name}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={`input col-span-3 ${over ? "border-red-400" : ""}`}
                      value={line.quantity}
                      onChange={(e) => setLine(idx, { quantity: e.target.value })}
                    />
                    <div className={`col-span-2 text-xs ${over ? "text-red-600" : "text-gray-400"}`}>
                      {t("transfers.available")}: {fmtNumber(avail)}
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
                );
              })}
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
