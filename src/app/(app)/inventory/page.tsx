"use client";

import { useEffect, useState, useCallback } from "react";
import { format, startOfMonth, startOfYear, endOfDay } from "date-fns";
import { DateNavInput } from "@/components/ui/DateNavInput";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/lib/i18n";

interface ServiceUsage {
  serviceId: string;
  name: string;
  arabicName: string | null;
  count: number;
  totalQty: number;
}

type Period = "today" | "month" | "year" | "custom";

function getPeriodRange(period: Period, customFrom: string, customTo: string) {
  const today = new Date();
  if (period === "today") return { from: format(today, "yyyy-MM-dd"), to: format(today, "yyyy-MM-dd") };
  if (period === "month") return { from: format(startOfMonth(today), "yyyy-MM-dd"), to: format(today, "yyyy-MM-dd") };
  if (period === "year") return { from: format(startOfYear(today), "yyyy-MM-dd"), to: format(today, "yyyy-MM-dd") };
  return { from: customFrom, to: customTo };
}

export default function InventoryPage() {
  const { t, lang } = useTranslation();
  const today = format(new Date(), "yyyy-MM-dd");

  const [period, setPeriod] = useState<Period>("today");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [items, setItems] = useState<ServiceUsage[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { from, to } = getPeriodRange(period, customFrom, customTo);
    const params = new URLSearchParams({
      from: new Date(from).toISOString(),
      to: endOfDay(new Date(to)).toISOString(),
    });
    const data = await fetch(`/api/inventory?${params}`).then((r) => r.json());
    setItems(Array.isArray(data.items) ? data.items : []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [period, customFrom, customTo]);

  useEffect(() => { load(); }, [load]);

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
              <DateNavInput value={customFrom} onChange={setCustomFrom} />
            </div>
            <div>
              <label className="label">{t("field.to")}</label>
              <DateNavInput value={customTo} onChange={setCustomTo} />
            </div>
            <button onClick={load} className="btn-primary">{t("action.filter")}</button>
          </div>
        )}
      </div>

      {/* Results */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="card h-12 animate-pulse bg-gray-100" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="card p-8 text-center text-gray-400">
          <div className="text-3xl mb-2">📦</div>
          <div className="text-sm">{t("inventory.noUsage")}</div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">{t("inventory.usageSummary")}</h2>
            <span className="text-xs text-gray-500">{total} {t("inventory.totalServices")}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="th-start px-4 py-3 font-medium text-gray-600">#</th>
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("field.service")}</th>
                <th className="text-end px-4 py-3 font-medium text-gray-600">{t("field.quantity")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item, idx) => (
                <tr key={item.serviceId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {lang === "ar" && item.arabicName ? item.arabicName : item.name}
                    {item.arabicName && lang !== "ar" && (
                      <span className="text-xs text-gray-400 ms-2">{item.arabicName}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-end font-semibold text-primary-700">{item.totalQty}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td colSpan={2} className="px-4 py-3 font-semibold text-gray-700">{t("field.total")}</td>
                <td className="px-4 py-3 text-end font-bold text-primary-700">{total}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
