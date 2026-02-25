"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/lib/i18n";
import { format, startOfDay, startOfWeek, startOfMonth } from "date-fns";

interface VisitItem {
  service: { name: string; arabicName: string | null };
  quantity: number;
  priceAtTime: number;
}

interface Visit {
  id: string;
  visitAt: string;
  paymentMethod: string;
  discount: number;
  total: number;
  customer: { name: string };
  barber: { name: string };
  items: VisitItem[];
}

interface TopService {
  name: string;
  arabicName: string | null;
  count: number;
  revenue: number;
}

interface PerBarber {
  barberId: string;
  barberName: string;
  visitCount: number;
  revenue: number;
}

interface Penalty {
  id: string;
  date: string;
  barberName: string;
  amount: number;
  reason: string;
}

interface Expense {
  id: string;
  date: string;
  amount: number;
  reason: string;
}

interface Summary {
  visitCount: number;
  totalRevenue: number;
  cashTotal: number;
  cardTotal: number;
  mixedTotal: number;
  discountsTotal: number;
  expensesTotal: number;
  netRevenue: number;
  topServices: TopService[];
}

interface ReportData {
  visits: Visit[];
  summary: Summary;
  perBarber: PerBarber[];
  penalties: Penalty[];
  expenses: Expense[];
}

type Preset = "today" | "week" | "month" | "custom";

function getPresetRange(preset: Preset): { from: string; to: string } {
  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");
  if (preset === "today") {
    return { from: todayStr, to: todayStr };
  }
  if (preset === "week") {
    const monday = startOfWeek(now, { weekStartsOn: 1 });
    return { from: format(monday, "yyyy-MM-dd"), to: todayStr };
  }
  if (preset === "month") {
    const first = startOfMonth(now);
    return { from: format(first, "yyyy-MM-dd"), to: todayStr };
  }
  return { from: todayStr, to: todayStr };
}

const paymentLabel: Record<string, string> = { CASH: "Cash", CARD: "Card", MIXED: "Mixed" };

export default function ReportsPage() {
  const { data: session } = useSession();
  const isOwner = session?.user?.role === "OWNER";
  const { t, fmtCurrency, fmtDateTime, fmtDate, lang } = useTranslation();

  const [preset, setPreset] = useState<Preset>("month");
  const initial = getPresetRange("month");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const doFetch = useCallback(async (fromDate: string, toDate: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        from: startOfDay(new Date(fromDate)).toISOString(),
        to: new Date(toDate + "T23:59:59").toISOString(),
      });
      const res = await fetch(`/api/reports?${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
      setFetched(true);
    }
  }, []);

  // Auto-fetch on mount with default "This Month" range
  useEffect(() => {
    doFetch(initial.from, initial.to);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchReport = () => doFetch(from, to);

  const handlePreset = (p: Preset) => {
    setPreset(p);
    if (p !== "custom") {
      const range = getPresetRange(p);
      setFrom(range.from);
      setTo(range.to);
      doFetch(range.from, range.to);
    }
  };

  const handleExport = async () => {
    if (!data) return;
    const { downloadExcel } = await import("@/lib/excel");
    const periodLabel = `${from} to ${to}`;

    const summaryRows = [
      { Field: "Period", Value: periodLabel },
      { Field: t("reports.totalRevenue"), Value: data.summary.totalRevenue },
      { Field: t("reports.cashRevenue"), Value: data.summary.cashTotal },
      { Field: t("reports.cardRevenue"), Value: data.summary.cardTotal },
      { Field: t("reports.mixedRevenue"), Value: data.summary.mixedTotal },
      { Field: t("reports.discounts"), Value: data.summary.discountsTotal },
      { Field: t("expenses.totalExpenses"), Value: data.summary.expensesTotal },
      { Field: t("expenses.netRevenue"), Value: data.summary.netRevenue },
      { Field: "Visits", Value: data.summary.visitCount },
      {},
      { Field: "Top Services", Value: "" },
      ...data.summary.topServices.map((s) => ({
        Field: s.name,
        Value: s.count,
        Revenue: s.revenue,
      })),
    ];

    const visitsRows = data.visits.map((v) => ({
      Date: new Date(v.visitAt).toLocaleString(),
      Customer: v.customer.name,
      Barber: v.barber.name,
      Services: v.items.map((i) => `${i.service.name}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`).join(", "),
      Payment: paymentLabel[v.paymentMethod] ?? v.paymentMethod,
      Subtotal: v.items.reduce((s, i) => s + i.priceAtTime * i.quantity, 0),
      "Discount%": v.discount,
      Total: v.total,
    }));

    const perBarberRows = data.perBarber.map((b) => ({
      Barber: b.barberName,
      Visits: b.visitCount,
      Revenue: b.revenue,
    }));

    const penaltiesRows = data.penalties.map((p) => ({
      Date: new Date(p.date).toLocaleDateString(),
      Barber: p.barberName,
      Amount: p.amount,
      Reason: p.reason,
    }));

    const sheets: { name: string; rows: Record<string, unknown>[] }[] = [
      { name: "Summary", rows: summaryRows },
      { name: "Visits", rows: visitsRows },
    ];
    if (isOwner) {
      sheets.push({ name: "Per Barber", rows: perBarberRows });
    }
    sheets.push({ name: "Penalties", rows: penaltiesRows });

    if (data.expenses.length > 0) {
      const expensesRows = data.expenses.map((e) => ({
        Date: new Date(e.date).toLocaleDateString(),
        Reason: e.reason,
        Amount: e.amount,
      }));
      sheets.push({ name: "Expenses", rows: expensesRows });
    }

    downloadExcel(`report-${from}-to-${to}.xlsx`, sheets);
  };

  const hasData = data && data.visits.length > 0;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title={t("reports.title")}
        subtitle={t("reports.subtitle")}
      />

      {/* Period selector */}
      <div className="card p-4 mb-6">
        <div className="flex flex-wrap gap-2 mb-4">
          {(["today", "week", "month", "custom"] as Preset[]).map((p) => (
            <button
              key={p}
              onClick={() => handlePreset(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                preset === p
                  ? "bg-primary-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {p === "today" ? t("reports.today")
                : p === "week" ? t("reports.thisWeek")
                : p === "month" ? t("reports.thisMonth")
                : t("reports.custom")}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="label">{t("reports.from")}</label>
            <input
              type="date"
              className="input"
              value={from}
              onChange={(e) => { setFrom(e.target.value); setPreset("custom"); }}
            />
          </div>
          <div>
            <label className="label">{t("reports.to")}</label>
            <input
              type="date"
              className="input"
              value={to}
              onChange={(e) => { setTo(e.target.value); setPreset("custom"); }}
            />
          </div>
          <button onClick={fetchReport} disabled={loading} className="btn-primary">
            {loading ? "…" : t("action.filter")}
          </button>
          <button
            onClick={handleExport}
            disabled={!hasData}
            className="btn-secondary"
          >
            {t("reports.exportExcel")}
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-4 animate-pulse h-20 bg-gray-100" />
          ))}
        </div>
      )}

      {/* No data */}
      {fetched && !loading && !hasData && (
        <div className="card p-8 text-center text-gray-500">
          <div className="text-3xl mb-2">📊</div>
          <div>{t("reports.noData")}</div>
        </div>
      )}

      {/* Results */}
      {hasData && !loading && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <SummaryCard label={t("reports.totalRevenue")} value={`$${fmtCurrency(data.summary.totalRevenue)}`} />
            <SummaryCard label={t("expenses.totalExpenses")} value={`-$${fmtCurrency(data.summary.expensesTotal)}`} danger />
            <SummaryCard label={t("expenses.netRevenue")} value={`$${fmtCurrency(data.summary.netRevenue)}`} accent />
            <SummaryCard label={t("common.visits")} value={String(data.summary.visitCount)} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <SummaryCard label={t("reports.cashRevenue")} value={`$${fmtCurrency(data.summary.cashTotal)}`} />
            <SummaryCard label={t("reports.cardRevenue")} value={`$${fmtCurrency(data.summary.cardTotal)}`} />
            <SummaryCard label={t("reports.mixedRevenue")} value={`$${fmtCurrency(data.summary.mixedTotal)}`} />
          </div>

          {/* Top services */}
          {data.summary.topServices.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-700">
                {t("reports.topServices")}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="th-start px-4 py-2 font-medium text-gray-500">{t("field.service")}</th>
                    <th className="text-end px-4 py-2 font-medium text-gray-500">{t("common.visits")}</th>
                    <th className="text-end px-4 py-2 font-medium text-gray-500">{t("field.total")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.summary.topServices.map((s, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2">{lang === "ar" && s.arabicName ? s.arabicName : s.name}</td>
                      <td className="px-4 py-2 text-end text-gray-600">{s.count}</td>
                      <td className="px-4 py-2 text-end font-medium">${fmtCurrency(s.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Per barber (owner only) */}
          {isOwner && data.perBarber.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-700">
                {t("reports.perBarber")}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="th-start px-4 py-2 font-medium text-gray-500">{t("field.barber")}</th>
                    <th className="text-end px-4 py-2 font-medium text-gray-500">{t("common.visits")}</th>
                    <th className="text-end px-4 py-2 font-medium text-gray-500">{t("salaries.revenue")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.perBarber.map((b) => (
                    <tr key={b.barberId} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium">{b.barberName}</td>
                      <td className="px-4 py-2 text-end text-gray-600">{b.visitCount}</td>
                      <td className="px-4 py-2 text-end font-medium">${fmtCurrency(b.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Visits list */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-700">
              {t("reports.visitsList")} ({data.visits.length})
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="th-start px-4 py-2 font-medium text-gray-500">{t("field.dateTime")}</th>
                    <th className="th-start px-4 py-2 font-medium text-gray-500">{t("field.name")}</th>
                    {isOwner && <th className="th-start px-4 py-2 font-medium text-gray-500">{t("field.barber")}</th>}
                    <th className="th-start px-4 py-2 font-medium text-gray-500">{t("field.services")}</th>
                    <th className="th-start px-4 py-2 font-medium text-gray-500">{t("field.paymentMethod")}</th>
                    <th className="text-end px-4 py-2 font-medium text-gray-500">{t("field.total")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.visits.map((v) => (
                    <tr key={v.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-500 text-xs whitespace-nowrap">{fmtDateTime(v.visitAt)}</td>
                      <td className="px-4 py-2 font-medium">{v.customer.name}</td>
                      {isOwner && <td className="px-4 py-2 text-gray-600">{v.barber.name}</td>}
                      <td className="px-4 py-2 text-gray-600 text-xs">
                        {v.items.map((i) => `${lang === "ar" && i.service.arabicName ? i.service.arabicName : i.service.name}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`).join(", ")}
                      </td>
                      <td className="px-4 py-2 text-gray-600">
                        {v.paymentMethod === "CASH" ? t("common.cash")
                          : v.paymentMethod === "CARD" ? t("common.card")
                          : t("common.mixed")}
                      </td>
                      <td className="px-4 py-2 text-end font-semibold">
                        ${fmtCurrency(v.total)}
                        {v.discount > 0 && (
                          <span className="block text-xs text-red-400 font-normal">-{v.discount}%</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Penalties */}
          {data.penalties.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-700">
                {t("reports.penaltiesList")} ({data.penalties.length})
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="th-start px-4 py-2 font-medium text-gray-500">{t("field.date")}</th>
                    {isOwner && <th className="th-start px-4 py-2 font-medium text-gray-500">{t("field.barber")}</th>}
                    <th className="text-end px-4 py-2 font-medium text-gray-500">{t("field.amount")}</th>
                    <th className="th-start px-4 py-2 font-medium text-gray-500">{t("field.reason")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.penalties.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-500 text-xs">{fmtDate(p.date)}</td>
                      {isOwner && <td className="px-4 py-2">{p.barberName}</td>}
                      <td className="px-4 py-2 text-end font-medium text-red-600">${fmtCurrency(p.amount)}</td>
                      <td className="px-4 py-2 text-gray-600">{p.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Expenses */}
          {isOwner && data.expenses.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <span className="font-semibold text-gray-700">
                  {t("expenses.title")} ({data.expenses.length})
                </span>
                <span className="text-sm font-bold text-red-600">
                  -{fmtCurrency(data.summary.expensesTotal)} total
                </span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="th-start px-4 py-2 font-medium text-gray-500">{t("field.date")}</th>
                    <th className="th-start px-4 py-2 font-medium text-gray-500">{t("field.reason")}</th>
                    <th className="text-end px-4 py-2 font-medium text-gray-500">{t("expenses.amount")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.expenses.map((e) => (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-500 text-xs whitespace-nowrap">{fmtDate(e.date)}</td>
                      <td className="px-4 py-2 text-gray-900">{e.reason}</td>
                      <td className="px-4 py-2 text-end font-semibold text-red-600">-${fmtCurrency(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, accent, danger }: { label: string; value: string; accent?: boolean; danger?: boolean }) {
  return (
    <div className={`card p-4 ${accent ? "border-primary-200 bg-primary-50" : danger ? "border-red-200 bg-red-50" : ""}`}>
      <div className={`text-xs font-medium mb-1 ${accent ? "text-primary-600" : danger ? "text-red-600" : "text-gray-500"}`}>{label}</div>
      <div className={`text-xl font-bold ${accent ? "text-primary-700" : danger ? "text-red-700" : "text-gray-900"}`}>{value}</div>
    </div>
  );
}
