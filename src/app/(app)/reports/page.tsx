"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { DateNavInput } from "@/components/ui/DateNavInput";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/lib/i18n";
import { paymentMethodKey, paymentMethodName } from "@/lib/payments";
import { Note } from "@/components/ui/Note";
import { format, startOfWeek, startOfMonth } from "date-fns";

interface ShopSettings {
  shopName: string;
  shopPhone: string | null;
  shopAddress: string | null;
  receiptFooter: string | null;
  shopLogo: string | null;
}

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function printReportReceipt(
  data: ReportData,
  shop: ShopSettings,
  from: string,
  to: string,
  isOwner: boolean,
) {
  const { summary, perBarber, expenses } = data;
  const period = from === to ? from : `${from} → ${to}`;

  const topServicesHtml = summary.topServices.length > 0
    ? `<hr /><div class="bold">TOP SERVICES</div><table>
        ${summary.topServices.slice(0, 8).map((s, i) =>
          `<tr><td>${i + 1}. ${s.name}</td><td style="text-align:right">${s.count}× ${fmt(s.revenue)}</td></tr>`
        ).join("")}
      </table>`
    : "";

  const perBarberHtml = isOwner && perBarber.length > 0
    ? `<hr /><div class="bold">PER BARBER</div><table>
        ${perBarber.map((b) =>
          `<tr><td>${b.barberName}</td><td style="text-align:right">${b.visitCount}v ${fmt(b.revenue)}</td></tr>`
        ).join("")}
      </table>`
    : "";

  const expensesHtml = isOwner && expenses.length > 0
    ? `<hr /><div class="bold">EXPENSES</div><table>
        ${expenses.map((e) =>
          `<tr><td>${e.reason}</td><td style="text-align:right">-${fmt(e.amount)}</td></tr>`
        ).join("")}
      </table>`
    : "";

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { color: #000 !important; }
  body { font-family: monospace; font-size: 12px; width: 80mm; margin: 0 auto; padding: 8px; }
  h1 { text-align: center; font-size: 14px; margin: 4px 0; }
  p { text-align: center; margin: 2px 0; font-size: 11px; }
  .title { text-align: center; font-size: 12px; font-weight: bold; margin: 6px 0; text-transform: uppercase; letter-spacing: 1px; }
  hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2px 0; }
  .row { display: flex; justify-content: space-between; padding: 2px 0; }
  .bold { font-weight: bold; }
  .footer { text-align: center; margin-top: 8px; font-size: 11px; }
</style>
</head>
<body>
${shop.shopLogo ? `<div style="text-align:center;margin-bottom:6px;"><img src="${shop.shopLogo}" style="max-width:160px;max-height:120px;object-fit:contain;" /></div>` : ""}
<h1>${shop.shopName}</h1>
${shop.shopPhone ? `<p>${shop.shopPhone}</p>` : ""}
${shop.shopAddress ? `<p>${shop.shopAddress}</p>` : ""}
<hr />
<div class="title">Period Report</div>
<div class="row"><span>Period:</span><span>${period}</span></div>
<hr />
<div class="bold">REVENUE</div>
<div class="row"><span>Total Visits:</span><span>${summary.visitCount}</span></div>
<div class="row"><span>Cash:</span><span>${fmt(summary.cashTotal)}</span></div>
<div class="row"><span>Card:</span><span>${fmt(summary.cardTotal)}</span></div>
${(summary.instapayTotal ?? 0) > 0 ? `<div class="row"><span>InstaPay:</span><span>${fmt(summary.instapayTotal)}</span></div>` : ""}
${(summary.tipsTotal ?? 0) > 0 ? `<div class="row"><span>Tips (deducted):</span><span>-${fmt(summary.tipsTotal)}</span></div>` : ""}
${summary.discountsTotal > 0 ? `<div class="row"><span>Discounts:</span><span>-${fmt(summary.discountsTotal)}</span></div>` : ""}
<div class="row bold" style="border-top:1px solid #000;padding-top:4px;margin-top:2px"><span>Total Revenue:</span><span>${fmt(summary.totalRevenue)}</span></div>
${summary.visaCommission > 0 ? `<div class="row"><span>Visa Commission (${summary.visaPercent}%):</span><span>-${fmt(summary.visaCommission)}</span></div>` : ""}
${isOwner && summary.expensesTotal > 0 ? `<div class="row"><span>Expenses:</span><span>-${fmt(summary.expensesTotal)}</span></div>` : ""}
${isOwner ? `<div class="row bold"><span>Net Revenue:</span><span>${fmt(summary.netRevenue)}</span></div>` : ""}
${topServicesHtml}
${perBarberHtml}
${expensesHtml}
<hr />
${shop.receiptFooter ? `<div class="footer">${shop.receiptFooter}</div>` : ""}
</body>
</html>`;

  const w = window.open("", "_blank", "width=400,height=600");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

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
  barber: { name: string } | null;
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
  paymentMethod: string;
  category: string | null;
}

interface Advance {
  id: string;
  date: string;
  barberName: string;
  amount: number;
  paymentMethod: string;
  notes: string | null;
}

interface Summary {
  visitCount: number;
  totalRevenue: number;
  cashTotal: number;
  cardTotal: number;
  instapayTotal: number;
  tipsTotal: number;
  discountsTotal: number;
  expensesTotal: number;
  cashExpenses: number;
  cardExpenses: number;
  visaPercent: number;
  visaCommission: number;
  cardNet: number;
  netRevenue: number;
  advancesTotal: number;
  penaltiesTotal: number;
  topServices: TopService[];
}

interface ReportData {
  visits: Visit[];
  summary: Summary;
  perBarber: PerBarber[];
  penalties: Penalty[];
  expenses: Expense[];
  advances: Advance[];
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

export default function ReportsPage() {
  const { data: session } = useSession();
  const isOwner = session?.user?.role === "OWNER";
  const { t, fmtCurrency, fmtDateTime, fmtDate, lang, fmtCustomerName } = useTranslation();

  const [preset, setPreset] = useState<Preset>("month");
  const initial = getPresetRange("month");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [visitsPage, setVisitsPage] = useState(1);

  const PAGE_SIZE = 15;
  const [shop, setShop] = useState<ShopSettings>({ shopName: "Escape Barbershop", shopPhone: null, shopAddress: null, receiptFooter: null, shopLogo: null });

  useEffect(() => {
    fetch("/api/settings/receipt").then((r) => r.json()).then((d) => {
      if (!d.error) setShop(d);
    });
  }, []);

  const doFetch = useCallback(async (fromDate: string, toDate: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        from: new Date(fromDate + "T00:00:00").toISOString(),
        to: new Date(toDate + "T23:59:59").toISOString(),
      });
      const res = await fetch(`/api/reports?${params}`);
      if (res.ok) { setData(await res.json()); setVisitsPage(1); }
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
      { Field: t("reports.instapayRevenue"), Value: data.summary.instapayTotal ?? 0 },
      { Field: t("reports.discounts"), Value: data.summary.discountsTotal },
      { Field: t("reports.visaCommission"), Value: data.summary.visaCommission ?? 0 },
      { Field: t("reports.cardNet"), Value: data.summary.cardNet ?? 0 },
      { Field: t("reports.cashExpenses"), Value: data.summary.cashExpenses ?? 0 },
      { Field: t("reports.cardExpenses"), Value: data.summary.cardExpenses ?? 0 },
      { Field: t("expenses.totalExpenses"), Value: data.summary.expensesTotal },
      { Field: t("expenses.netRevenue"), Value: data.summary.netRevenue },
      { Field: t("reports.advancesTotal"), Value: data.summary.advancesTotal ?? 0 },
      { Field: t("salaries.penalties"), Value: data.summary.penaltiesTotal ?? 0 },
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
      Barber: v.barber?.name ?? "—",
      Services: v.items.map((i) => `${i.service.name}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`).join(", "),
      Payment: paymentMethodName(v.paymentMethod),
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
        "Paid by": e.paymentMethod === "CARD" ? "Visa" : "Cash",
        Amount: e.amount,
      }));
      sheets.push({ name: "Expenses", rows: expensesRows });
    }

    if ((data.advances?.length ?? 0) > 0) {
      sheets.push({
        name: "Advances",
        rows: data.advances.map((a) => ({
          Date: new Date(a.date).toLocaleDateString(),
          Barber: a.barberName,
          "Paid by": a.paymentMethod === "CARD" ? "Visa" : "Cash",
          Amount: a.amount,
          Notes: a.notes ?? "",
        })),
      });
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
            <DateNavInput value={from} onChange={(v) => { setFrom(v); setPreset("custom"); }} />
          </div>
          <div>
            <label className="label">{t("reports.to")}</label>
            <DateNavInput value={to} onChange={(v) => { setTo(v); setPreset("custom"); }} />
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
          <button
            onClick={() => data && printReportReceipt(data, shop, from, to, isOwner)}
            disabled={!hasData}
            className="btn-secondary"
          >
            🖨️ Print
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
          <Note tone="rule" title={t("note.reportsTitle")} icon="chart-line">
            {t("note.reportsBody")}
          </Note>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <SummaryCard label={t("reports.totalRevenue")} value={`${fmtCurrency(data.summary.totalRevenue)}`} />
            <SummaryCard label={t("expenses.totalExpenses")} value={`-${fmtCurrency(data.summary.expensesTotal)}`} danger />
            <SummaryCard label={t("expenses.netRevenue")} value={`${fmtCurrency(data.summary.netRevenue)}`} accent />
            <SummaryCard label={t("common.visits")} value={String(data.summary.visitCount)} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <SummaryCard label={t("reports.cashRevenue")} value={`${fmtCurrency(data.summary.cashTotal)}`} />
            <SummaryCard label={t("reports.cardRevenue")} value={`${fmtCurrency(data.summary.cardTotal)}`} />
            <SummaryCard label={t("reports.instapayRevenue")} value={`${fmtCurrency(data.summary.instapayTotal ?? 0)}`} />
            {(data.summary.tipsTotal ?? 0) > 0 && (
              <SummaryCard label={t("newVisit.tip")} value={`-${fmtCurrency(data.summary.tipsTotal)}`} danger />
            )}
          </div>

          {/* What the card machine takes, and what is left on the card account */}
          {(data.summary.cardTotal > 0 || (data.summary.visaCommission ?? 0) > 0) && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">{t("finance.cardAccount")}</h2>
              <div className="space-y-2 text-sm max-w-sm">
                <div className="flex justify-between text-gray-600">
                  <span>{t("reports.cardRevenue")}</span>
                  <span className="text-blue-700">+{fmtCurrency(data.summary.cardTotal)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>
                    {t("reports.visaCommission")}
                    <span className="text-gray-400"> ({data.summary.visaPercent ?? 0}%)</span>
                  </span>
                  <span className="text-red-600">-{fmtCurrency(data.summary.visaCommission ?? 0)}</span>
                </div>
                {(data.summary.cardExpenses ?? 0) > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>{t("reports.cardExpenses")}</span>
                    <span className="text-red-600">-{fmtCurrency(data.summary.cardExpenses)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-200">
                  <span>{t("reports.cardNet")}</span>
                  <span>{fmtCurrency(data.summary.cardNet ?? 0)}</span>
                </div>
              </div>
            </div>
          )}

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
                      <td className="px-4 py-2 text-end font-medium">{fmtCurrency(s.revenue)}</td>
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
                      <td className="px-4 py-2 text-end font-medium">{fmtCurrency(b.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Visits list */}
          {(() => {
            const totalPages = Math.ceil(data.visits.length / PAGE_SIZE);
            const pageVisits = data.visits.slice((visitsPage - 1) * PAGE_SIZE, visitsPage * PAGE_SIZE);
            return (
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
                      {pageVisits.map((v) => (
                        <tr key={v.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-500 text-xs whitespace-nowrap">{fmtDateTime(v.visitAt)}</td>
                          <td className="px-4 py-2 font-medium">{fmtCustomerName(v.customer.name)}</td>
                          {isOwner && <td className="px-4 py-2 text-gray-600">{v.barber?.name ?? "—"}</td>}
                          <td className="px-4 py-2 text-gray-600 text-xs">
                            {v.items.map((i) => `${lang === "ar" && i.service.arabicName ? i.service.arabicName : i.service.name}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`).join(", ")}
                          </td>
                          <td className="px-4 py-2 text-gray-600">
                            {t(paymentMethodKey(v.paymentMethod))}
                          </td>
                          <td className="px-4 py-2 text-end font-semibold">
                            {fmtCurrency(v.total)}
                            {v.discount > 0 && (
                              <span className="block text-xs text-red-400 font-normal">-{v.discount}%</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 && (
                  <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm">
                    <span className="text-gray-500">
                      Page {visitsPage} of {totalPages}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setVisitsPage(1)}
                        disabled={visitsPage === 1}
                        className="px-2 py-1 rounded border border-gray-200 text-gray-600 disabled:opacity-40 hover:bg-gray-50"
                      >«</button>
                      <button
                        onClick={() => setVisitsPage((p) => p - 1)}
                        disabled={visitsPage === 1}
                        className="px-2 py-1 rounded border border-gray-200 text-gray-600 disabled:opacity-40 hover:bg-gray-50"
                      >‹</button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter((p) => p === 1 || p === totalPages || Math.abs(p - visitsPage) <= 2)
                        .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                          if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("…");
                          acc.push(p);
                          return acc;
                        }, [])
                        .map((p, i) =>
                          p === "…" ? (
                            <span key={`ellipsis-${i}`} className="px-2 py-1 text-gray-400">…</span>
                          ) : (
                            <button
                              key={p}
                              onClick={() => setVisitsPage(p as number)}
                              className={`px-2 py-1 rounded border text-sm ${visitsPage === p ? "bg-primary-600 text-white border-primary-600" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                            >{p}</button>
                          )
                        )}
                      <button
                        onClick={() => setVisitsPage((p) => p + 1)}
                        disabled={visitsPage === totalPages}
                        className="px-2 py-1 rounded border border-gray-200 text-gray-600 disabled:opacity-40 hover:bg-gray-50"
                      >›</button>
                      <button
                        onClick={() => setVisitsPage(totalPages)}
                        disabled={visitsPage === totalPages}
                        className="px-2 py-1 rounded border border-gray-200 text-gray-600 disabled:opacity-40 hover:bg-gray-50"
                      >»</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Penalties */}
          {data.penalties.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <span className="font-semibold text-gray-700">
                  {t("reports.penaltiesList")} ({data.penalties.length})
                </span>
                <span className="block text-xs font-normal text-gray-500 mt-0.5">
                  {t("reports.payrollOnlyNote")}
                </span>
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
                      <td className="px-4 py-2 text-end font-medium text-red-600">{fmtCurrency(p.amount)}</td>
                      <td className="px-4 py-2 text-gray-600">{p.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Advances: shown for the record, never subtracted from revenue */}
          {isOwner && (data.advances?.length ?? 0) > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <span className="font-semibold text-gray-700">
                  {t("reports.advancesList")} ({data.advances.length})
                </span>
                <span className="text-sm font-bold text-gray-700">
                  {fmtCurrency(data.summary.advancesTotal ?? 0)}
                </span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="th-start px-4 py-2 font-medium text-gray-500">{t("field.date")}</th>
                    <th className="th-start px-4 py-2 font-medium text-gray-500">{t("field.barber")}</th>
                    <th className="th-start px-4 py-2 font-medium text-gray-500">{t("expenses.paidBy")}</th>
                    <th className="text-end px-4 py-2 font-medium text-gray-500">{t("field.amount")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.advances.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-500 text-xs whitespace-nowrap">{fmtDate(a.date)}</td>
                      <td className="px-4 py-2">{a.barberName}</td>
                      <td className="px-4 py-2 text-gray-500 text-xs">
                        {a.paymentMethod === "CARD" ? t("common.card") : t("common.cash")}
                      </td>
                      <td className="px-4 py-2 text-end font-medium text-gray-900">{fmtCurrency(a.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2 text-xs text-gray-500 bg-gray-50 border-t border-gray-100">
                {t("reports.payrollOnlyNote")}
              </div>
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
                    <th className="th-start px-4 py-2 font-medium text-gray-500">{t("expenses.paidBy")}</th>
                    <th className="text-end px-4 py-2 font-medium text-gray-500">{t("expenses.amount")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.expenses.map((e) => (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-500 text-xs whitespace-nowrap">{fmtDate(e.date)}</td>
                      <td className="px-4 py-2 text-gray-900">{e.reason}</td>
                      <td className="px-4 py-2 text-gray-500 text-xs">
                        {e.paymentMethod === "CARD" ? t("common.card") : t("common.cash")}
                      </td>
                      <td className="px-4 py-2 text-end font-semibold text-red-600">-{fmtCurrency(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t border-gray-100 text-xs text-gray-600">
                    <td colSpan={2} className="px-4 py-2">{t("reports.cashExpenses")}</td>
                    <td colSpan={2} className="px-4 py-2 text-end">-{fmtCurrency(data.summary.cashExpenses ?? 0)}</td>
                  </tr>
                  <tr className="bg-gray-50 text-xs text-gray-600">
                    <td colSpan={2} className="px-4 py-2">{t("reports.cardExpenses")}</td>
                    <td colSpan={2} className="px-4 py-2 text-end">-{fmtCurrency(data.summary.cardExpenses ?? 0)}</td>
                  </tr>
                </tfoot>
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
