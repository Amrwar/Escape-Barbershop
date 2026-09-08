"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { format } from "date-fns";
import { useSearchParams } from "next/navigation";
import { DateNavInput } from "@/components/ui/DateNavInput";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/lib/i18n";

interface SessionRow {
  id: string;
  openedAt: string;
  closedAt: string | null;
  status: string;
  openingCash: number;
  closingCashCounted: number | null;
  openedBy: { name: string };
  closedBy: { name: string } | null;
  visitCount: number;
  movements: { type: string; amount: number; reason: string }[];
}

interface Summary {
  sessionCount: number;
  totalVisits: number;
  cashTotal: number;
  cardTotal: number;
  mixedCashAmount: number;
  mixedCardAmount: number;
  discountsTotal: number;
  cashIn: number;
  cashOut: number;
  expensesTotal: number;
  cashExpenses: number;
  cardExpenses: number;
  advancesTotal: number;
  cashAdvances: number;
  cardAdvances: number;
  visaPercent: number;
  visaCommission: number;
  cashSales: number;
  cardSales: number;
  cardNet: number;
  totalRevenue: number;
  netRevenue?: number;
  totalOpeningCash: number;
  expectedCash: number;
  totalCountedCash: number | null;
  difference: number | null;
}

interface ExpenseRow {
  id: string;
  date: string;
  amount: number;
  reason: string;
  paymentMethod: string;
  category: string | null;
}

interface AdvanceRow {
  id: string;
  date: string;
  amount: number;
  paymentMethod: string;
  barberName: string;
  notes: string | null;
}

interface PurchasesBlock {
  summary: { total: number; cash: number; card: number; credit: number };
  rows: {
    id: string;
    date: string;
    number: string | null;
    supplierName: string | null;
    paymentType: string;
    total: number;
  }[];
}

interface DayReport {
  date: string;
  isOwner: boolean;
  sessions: SessionRow[];
  summary: Summary;
  expenses: ExpenseRow[];
  advances?: AdvanceRow[];
  purchases?: PurchasesBlock;
  transfersCount: number;
  topServices: { name: string; count: number }[];
}

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

function printReceipt(report: DayReport, shop: ShopSettings) {
  const { summary, sessions, topServices } = report;
  const date = new Date(report.date).toLocaleDateString();

  const diffLine =
    summary.difference !== null
      ? `${summary.difference >= 0 ? "+" : ""}${fmt(summary.difference)} (${summary.difference >= 0 ? "Over" : "Short"})`
      : "—";

  const servicesHtml = topServices
    .slice(0, 8)
    .map((s, i) => `<tr><td>${i + 1}. ${s.name}</td><td style="text-align:right">${s.count}×</td></tr>`)
    .join("");

  const sessionsHtml = sessions
    .map(
      (s) =>
        `<tr><td>${new Date(s.openedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>` +
        `<td>${s.openedBy.name}</td>` +
        `<td style="text-align:right">${s.visitCount} visits</td>` +
        `<td style="text-align:right">${s.status}</td></tr>`
    )
    .join("");

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
<div class="title">End of Day Report</div>
<div class="row"><span>Date:</span><span>${date}</span></div>
<div class="row"><span>Sessions:</span><span>${summary.sessionCount}</span></div>
<hr />
<div class="bold">REVENUE</div>
<div class="row"><span>Total Visits:</span><span>${summary.totalVisits}</span></div>
<div class="row"><span>Cash Sales:</span><span>${fmt(summary.cashSales)}</span></div>
<div class="row"><span>Card Sales:</span><span>${fmt(summary.cardSales)}</span></div>
${summary.visaCommission > 0 ? `<div class="row"><span>Visa Commission (${summary.visaPercent}%):</span><span>-${fmt(summary.visaCommission)}</span></div>` : ""}
${summary.discountsTotal > 0 ? `<div class="row"><span>Discounts:</span><span>-${fmt(summary.discountsTotal)}</span></div>` : ""}
<div class="row bold" style="border-top:1px solid #000;padding-top:4px;margin-top:2px"><span>Total Revenue:</span><span>${fmt(summary.totalRevenue)}</span></div>
<hr />
<div class="bold">CASH RECONCILIATION</div>
<div class="row"><span>Opening:</span><span>${fmt(summary.totalOpeningCash)}</span></div>
<div class="row"><span>+ Cash Sales:</span><span>${fmt(summary.cashSales)}</span></div>
${summary.cashIn > 0 ? `<div class="row"><span>+ Cash In:</span><span>${fmt(summary.cashIn)}</span></div>` : ""}
${summary.cashOut > 0 ? `<div class="row"><span>- Cash Out:</span><span>${fmt(summary.cashOut)}</span></div>` : ""}
${summary.cashExpenses > 0 ? `<div class="row"><span>- Cash Expenses:</span><span>${fmt(summary.cashExpenses)}</span></div>` : ""}
${summary.cashAdvances > 0 ? `<div class="row"><span>- Advances:</span><span>${fmt(summary.cashAdvances)}</span></div>` : ""}
<div class="row bold"><span>Expected:</span><span>${fmt(summary.expectedCash)}</span></div>
${summary.totalCountedCash !== null ? `<div class="row"><span>Counted:</span><span>${fmt(summary.totalCountedCash)}</span></div>` : ""}
${summary.difference !== null ? `<div class="row bold"><span>Difference:</span><span>${diffLine}</span></div>` : ""}
<hr />
<div class="bold">CARD ACCOUNT</div>
<div class="row"><span>Card Sales:</span><span>${fmt(summary.cardSales)}</span></div>
${summary.visaCommission > 0 ? `<div class="row"><span>- Visa Commission:</span><span>${fmt(summary.visaCommission)}</span></div>` : ""}
${summary.cardExpenses > 0 ? `<div class="row"><span>- Visa Expenses:</span><span>${fmt(summary.cardExpenses)}</span></div>` : ""}
${summary.cardAdvances > 0 ? `<div class="row"><span>- Advances (visa):</span><span>${fmt(summary.cardAdvances)}</span></div>` : ""}
<div class="row bold"><span>Net Card:</span><span>${fmt(summary.cardNet)}</span></div>
${
  summary.netRevenue !== undefined
    ? `<hr /><div class="row bold"><span>Net Revenue:</span><span>${fmt(summary.netRevenue)}</span></div>`
    : ""
}
${summary.advancesTotal > 0 ? `<div class="row"><span>Advances (payroll):</span><span>${fmt(summary.advancesTotal)}</span></div>` : ""}
${topServices.length > 0 ? `<hr /><div class="bold">TOP SERVICES</div><table>${servicesHtml}</table>` : ""}
${sessions.length > 1 ? `<hr /><div class="bold">SESSIONS</div><table>${sessionsHtml}</table>` : ""}
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

function DayReportContent() {
  const { t, fmtCurrency } = useTranslation();
  const searchParams = useSearchParams();
  const today = format(new Date(), "yyyy-MM-dd");
  const [date, setDate] = useState(searchParams.get("date") ?? today);
  const [report, setReport] = useState<DayReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [shop, setShop] = useState<ShopSettings>({ shopName: "Escape Barbershop", shopPhone: null, shopAddress: null, receiptFooter: null, shopLogo: null });

  useEffect(() => {
    fetch("/api/settings/receipt").then((r) => r.json()).then((d) => {
      if (!d.error) setShop(d);
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    // Business day: midnight of date → 3AM of next day
    const from = new Date(date + "T00:00:00").toISOString();
    const nextDay = new Date(date + "T00:00:00");
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(3, 0, 0, 0);
    const to = nextDay.toISOString();
    const data = await fetch(`/api/cash-drawer/day-report?from=${from}&to=${to}`).then((r) => r.json());
    setReport(data.error ? null : data);
    setLoading(false);
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const s = report?.summary;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Screen header */}
      <div className="print:hidden flex items-center gap-3 mb-6">
        <div className="flex-1">
          <PageHeader title={t("cashDrawer.dayReport")} subtitle={t("cashDrawer.dayReportSubtitle")} />
        </div>
        {report && (
          <button onClick={() => printReceipt(report, shop)} className="btn-secondary text-sm">
            {t("cashDrawer.printReceiptBtn")}
          </button>
        )}
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-6">
        <h1 className="text-2xl font-bold">{t("cashDrawer.dayReport")}</h1>
        <p className="text-gray-600">{new Date(date).toLocaleDateString()}</p>
      </div>

      {/* Date picker */}
      <div className="print:hidden card p-4 mb-6 flex items-end gap-3">
        <div>
          <label className="label">{t("field.date")}</label>
          <DateNavInput value={date} onChange={setDate} />
        </div>
        <button onClick={load} className="btn-primary">{t("action.filter")}</button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="card h-24 animate-pulse bg-gray-100" />)}
        </div>
      ) : !report || report.sessions.length === 0 ? (
        <div className="card p-8 text-center text-gray-400">
          <div className="text-3xl mb-2">🗃️</div>
          <div className="text-sm">{t("cashDrawer.noSessionsForDay")}</div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="card p-4 text-center">
              <div className="text-xs text-gray-500">{t("cashDrawer.sessions")}</div>
              <div className="text-2xl font-bold text-gray-900">{s!.sessionCount}</div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-xs text-gray-500">{t("common.visits")}</div>
              <div className="text-2xl font-bold text-gray-900">{s!.totalVisits}</div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-xs text-gray-500">{t("cashDrawer.cashSales")}</div>
              <div className="text-2xl font-bold text-green-700">{fmtCurrency(s!.cashSales)}</div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-xs text-gray-500">{t("cashDrawer.cardSales")}</div>
              <div className="text-2xl font-bold text-blue-700">{fmtCurrency(s!.cardSales)}</div>
            </div>
          </div>

          {/* Cash reconciliation */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">{t("report.cashReconciliation")}</h2>
            <div className="space-y-2 text-sm max-w-sm">
              <div className="flex justify-between text-gray-600">
                <span>{t("cashDrawer.openingBalance")}</span>
                <span>{fmtCurrency(s!.totalOpeningCash)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>{t("cashDrawer.cashSales")}</span>
                <span className="text-green-700">+{fmtCurrency(s!.cashSales)}</span>
              </div>
              {s!.cashIn > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>{t("cashDrawer.cashIn")}</span>
                  <span className="text-green-700">+{fmtCurrency(s!.cashIn)}</span>
                </div>
              )}
              {s!.cashOut > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>{t("cashDrawer.cashOut")}</span>
                  <span className="text-red-600">-{fmtCurrency(s!.cashOut)}</span>
                </div>
              )}
              {s!.cashExpenses > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>{t("cashDrawer.cashExpenses")}</span>
                  <span className="text-red-600">-{fmtCurrency(s!.cashExpenses)}</span>
                </div>
              )}
              {s!.cashAdvances > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>{t("cashDrawer.advances")}</span>
                  <span className="text-red-600">-{fmtCurrency(s!.cashAdvances)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-200">
                <span>{t("cashDrawer.expectedCash")}</span>
                <span>{fmtCurrency(s!.expectedCash)}</span>
              </div>
              {s!.totalCountedCash !== null && (
                <>
                  <div className="flex justify-between text-gray-600">
                    <span>{t("cashDrawer.countedCash")}</span>
                    <span>{fmtCurrency(s!.totalCountedCash)}</span>
                  </div>
                  <div className={`flex justify-between font-bold pt-2 border-t border-gray-200 ${s!.difference !== null && s!.difference >= 0 ? "text-green-600" : "text-red-600"}`}>
                    <span>{t("cashDrawer.difference")}</span>
                    <span>
                      {s!.difference !== null
                        ? `${s!.difference >= 0 ? "+" : ""}${fmtCurrency(s!.difference)} (${s!.difference >= 0 ? t("cashDrawer.over") : t("cashDrawer.short")})`
                        : "—"}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Card account: what the machine actually leaves in the bank */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">{t("cashDrawer.cardAccount")}</h2>
            <div className="space-y-2 text-sm max-w-sm">
              <div className="flex justify-between text-gray-600">
                <span>{t("cashDrawer.cardSales")}</span>
                <span className="text-blue-700">+{fmtCurrency(s!.cardSales)}</span>
              </div>
              {s!.visaCommission > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>
                    {t("cashDrawer.visaCommission")}
                    <span className="text-gray-400"> ({s!.visaPercent}%)</span>
                  </span>
                  <span className="text-red-600">-{fmtCurrency(s!.visaCommission)}</span>
                </div>
              )}
              {s!.cardExpenses > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>{t("cashDrawer.cardExpenses")}</span>
                  <span className="text-red-600">-{fmtCurrency(s!.cardExpenses)}</span>
                </div>
              )}
              {s!.cardAdvances > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>{t("cashDrawer.advances")}</span>
                  <span className="text-red-600">-{fmtCurrency(s!.cardAdvances)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-200">
                <span>{t("cashDrawer.cardNet")}</span>
                <span>{fmtCurrency(s!.cardNet)}</span>
              </div>
            </div>
          </div>

          {/* Owner view: the profit line and the warehouse money for the day */}
          {report.isOwner && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">{t("cashDrawer.netRevenue")}</h2>
              <div className="space-y-2 text-sm max-w-sm">
                <div className="flex justify-between text-gray-600">
                  <span>{t("reports.totalRevenue")}</span>
                  <span>{fmtCurrency(s!.totalRevenue)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>{t("expenses.totalExpenses")}</span>
                  <span className="text-red-600">-{fmtCurrency(s!.expensesTotal)}</span>
                </div>
                {s!.visaCommission > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>{t("cashDrawer.visaCommission")}</span>
                    <span className="text-red-600">-{fmtCurrency(s!.visaCommission)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-200">
                  <span>{t("cashDrawer.netRevenue")}</span>
                  <span>{fmtCurrency(s!.netRevenue ?? 0)}</span>
                </div>
              </div>

              {/* Money that moved but is not a cost of the day */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {t("cashDrawer.memoTitle")}
                </div>
                <div className="flex justify-between text-sm text-gray-600 max-w-sm">
                  <span>{t("cashDrawer.advancesMemo")}</span>
                  <span>{fmtCurrency(s!.advancesTotal)}</span>
                </div>
                <div className="text-xs text-gray-400 mt-1">{t("cashDrawer.penaltiesMemo")}</div>
              </div>

              {report.purchases && report.purchases.summary.total > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    {t("cashDrawer.purchases")}
                  </div>
                  <div className="space-y-1 text-sm max-w-sm">
                    <div className="flex justify-between text-gray-600">
                      <span>{t("purchases.cashTotal")}</span>
                      <span>{fmtCurrency(report.purchases.summary.cash)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>{t("purchases.cardTotal")}</span>
                      <span>{fmtCurrency(report.purchases.summary.card)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>{t("purchases.creditTotal")}</span>
                      <span>{fmtCurrency(report.purchases.summary.credit)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Top services */}
          {report.topServices.length > 0 && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">{t("report.topServices")}</h2>
              <div className="space-y-2">
                {report.topServices.map((s, idx) => (
                  <div key={s.name} className="flex items-center gap-3 text-sm">
                    <span className="text-xs font-bold text-gray-400 w-5">#{idx + 1}</span>
                    <div className="flex-1 font-medium text-gray-900">{s.name}</div>
                    <span className="font-semibold text-primary-600">{s.count}×</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sessions breakdown */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">{t("cashDrawer.sessions")}</h2>
            <div className="space-y-3">
              {report.sessions.map((sess) => (
                <div key={sess.id} className="border border-gray-100 rounded-lg p-3 text-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-medium text-gray-900">
                        {new Date(sess.openedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {sess.closedAt && ` — ${new Date(sess.closedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                      </span>
                      <span className="text-xs text-gray-500 ms-2">by {sess.openedBy.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${sess.status === "OPEN" ? "bg-green-200 text-green-800" : "bg-gray-200 text-gray-600"}`}>
                        {sess.status === "OPEN" ? t("cashDrawer.sessionOpen") : t("cashDrawer.sessionClosed")}
                      </span>
                      <Link href={`/cash-drawer/report/${sess.id}`} className="btn-secondary text-xs print:hidden">
                        {t("cashDrawer.viewReport")}
                      </Link>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    {sess.visitCount} visits · Opening: {fmtCurrency(sess.openingCash)}
                    {sess.closingCashCounted !== null && ` · Counted: ${fmtCurrency(sess.closingCashCounted)}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DayReportPage() {
  return (
    <Suspense>
      <DayReportContent />
    </Suspense>
  );
}
