"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/lib/i18n";

interface ShopSettings {
  shopName: string;
  shopPhone: string | null;
  shopAddress: string | null;
  receiptFooter: string | null;
}

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function printSessionReceipt(report: ReportData, shop: ShopSettings) {
  const { session, summary, movements, topServices } = report;
  const date = new Date(session.openedAt).toLocaleString();

  const diffLine =
    summary.difference !== null
      ? `${summary.difference >= 0 ? "+" : ""}${fmt(summary.difference)} (${summary.difference >= 0 ? "Over" : "Short"})`
      : "—";

  const movementsHtml = movements
    .map(
      (m) =>
        `<div style="display:flex;justify-content:space-between;padding:2px 0">` +
        `<span>[${m.type}] ${m.reason}</span>` +
        `<span>${m.type === "IN" ? "+" : "-"}${fmt(m.amount)}</span></div>`
    )
    .join("");

  const servicesHtml = topServices
    .slice(0, 8)
    .map((s, i) => `<div style="display:flex;justify-content:space-between;padding:1px 0"><span>${i + 1}. ${s.name}</span><span>${s.count}×</span></div>`)
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
  .row { display: flex; justify-content: space-between; padding: 2px 0; }
  .bold { font-weight: bold; }
  .footer { text-align: center; margin-top: 8px; font-size: 11px; }
</style>
</head>
<body>
<h1>${shop.shopName}</h1>
${shop.shopPhone ? `<p>${shop.shopPhone}</p>` : ""}
${shop.shopAddress ? `<p>${shop.shopAddress}</p>` : ""}
<hr />
<div class="title">Session Report</div>
<div class="row"><span>Date:</span><span>${date}</span></div>
<div class="row"><span>Opened by:</span><span>${session.openedBy.name}</span></div>
${session.closedBy ? `<div class="row"><span>Closed by:</span><span>${session.closedBy.name}</span></div>` : ""}
<div class="row"><span>Status:</span><span>${session.status}</span></div>
<hr />
<div class="bold">REVENUE</div>
<div class="row"><span>Visits:</span><span>${summary.visitCount}</span></div>
<div class="row"><span>Cash Sales:</span><span>${fmt(summary.cashSales)}</span></div>
<div class="row"><span>Card Sales:</span><span>${fmt(summary.cardSales)}</span></div>
${summary.visaCommission > 0 ? `<div class="row"><span>Visa Commission (${summary.visaPercent}%):</span><span>-${fmt(summary.visaCommission)}</span></div><div class="row bold"><span>Net Card:</span><span>${fmt(summary.cardNet)}</span></div>` : ""}
${summary.discountsTotal > 0 ? `<div class="row"><span>Discounts:</span><span>-${fmt(summary.discountsTotal)}</span></div>` : ""}
<hr />
<div class="bold">CASH RECONCILIATION</div>
<div class="row"><span>Opening:</span><span>${fmt(session.openingCash)}</span></div>
<div class="row"><span>+ Cash Sales:</span><span>${fmt(summary.cashSales)}</span></div>
${summary.cashIn > 0 ? `<div class="row"><span>+ Cash In:</span><span>${fmt(summary.cashIn)}</span></div>` : ""}
${summary.cashOut > 0 ? `<div class="row"><span>- Cash Out:</span><span>${fmt(summary.cashOut)}</span></div>` : ""}
${summary.cashExpenses > 0 ? `<div class="row"><span>- Cash Expenses:</span><span>${fmt(summary.cashExpenses)}</span></div>` : ""}
${summary.cashAdvances > 0 ? `<div class="row"><span>- Advances:</span><span>${fmt(summary.cashAdvances)}</span></div>` : ""}
<div class="row bold"><span>Expected:</span><span>${fmt(summary.expectedCash)}</span></div>
${summary.countedCash !== null ? `<div class="row"><span>Counted:</span><span>${fmt(summary.countedCash)}</span></div>` : ""}
${summary.difference !== null ? `<div class="row bold"><span>Difference:</span><span>${diffLine}</span></div>` : ""}
${movements.length > 0 ? `<hr /><div class="bold">MOVEMENTS</div>${movementsHtml}` : ""}
${topServices.length > 0 ? `<hr /><div class="bold">TOP SERVICES</div>${servicesHtml}` : ""}
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

interface Movement {
  id: string;
  type: "IN" | "OUT";
  amount: number;
  reason: string;
  createdAt: string;
  createdBy: { name: string };
}

interface VisitItem {
  id: string;
  quantity: number;
  priceAtTime: number;
  service: { name: string };
}

interface Visit {
  id: string;
  visitAt: string;
  paymentMethod: string;
  total: number;
  cashAmount: number | null;
  cardAmount: number | null;
  discount: number;
  customer: { name: string };
  barber: { name: string };
  items: VisitItem[];
}

interface ReportData {
  session: {
    id: string;
    openedAt: string;
    closedAt: string | null;
    status: string;
    openingCash: number;
    closingCashCounted: number | null;
    notes: string | null;
    openedBy: { name: string };
    closedBy: { name: string } | null;
  };
  summary: {
    visitCount: number;
    cashTotal: number;
    cardTotal: number;
    cardSales: number;
    cardNet: number;
    visaPercent: number;
    visaCommission: number;
    cashExpenses: number;
    cardExpenses: number;
    cashAdvances: number;
    cardAdvances: number;
    advancesTotal: number;
    mixedCashAmount: number;
    discountsTotal: number;
    cashIn: number;
    cashOut: number;
    expensesTotal: number;
    cashSales: number;
    expectedCash: number;
    countedCash: number | null;
    difference: number | null;
  };
  movements: Movement[];
  visits: Visit[];
  revenuePerBarber: { barberId: string; name: string; revenue: number; visits: number }[];
  topServices: { serviceId: string; name: string; count: number }[];
}

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const { t, fmtCurrency, fmtCustomerName, fmtDate, fmtDateTime, fmtTime } = useTranslation();
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [shop, setShop] = useState<ShopSettings>({ shopName: "Escape Barbershop", shopPhone: null, shopAddress: null, receiptFooter: null });

  useEffect(() => {
    fetch("/api/settings/receipt").then((r) => r.json()).then((d) => { if (!d.error) setShop(d); });
  }, []);

  useEffect(() => {
    fetch(`/api/cash-drawer/report/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setReport(d);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const exportCsv = () => {
    if (!report) return;
    const rows: string[][] = [
      ["Type", "Date", "Customer", "Barber", "Services", "Payment", "Total", "Cash", "Card"],
    ];
    for (const v of report.visits) {
      rows.push([
        "Visit",
        new Date(v.visitAt).toLocaleString(),
        v.customer.name,
        v.barber?.name ?? "—",
        v.items.map((i) => `${i.service.name}×${i.quantity}`).join("; "),
        v.paymentMethod,
        v.total.toFixed(2),
        (v.cashAmount ?? "").toString(),
        (v.cardAmount ?? "").toString(),
      ]);
    }
    rows.push([]);
    rows.push(["Type", "Date", "Amount", "Reason", "By"]);
    for (const m of report.movements) {
      rows.push([
        m.type,
        new Date(m.createdAt).toLocaleString(),
        m.amount.toFixed(2),
        m.reason,
        m.createdBy.name,
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `session-${id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-100 rounded w-1/3" />
          <div className="h-64 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <p className="text-red-600">{error || "Report not found"}</p>
      </div>
    );
  }

  const { session, summary, movements, visits, revenuePerBarber, topServices } = report;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Print actions — hidden in print */}
      <div className="print:hidden flex items-center gap-3 mb-6">
        <div className="flex-1">
          <PageHeader
            title={t("report.title")}
            subtitle={`${fmtDate(session.openedAt)} · ${session.openedBy.name}`}
          />
        </div>
        <button onClick={() => window.print()} className="btn-secondary text-sm">
          {t("cashDrawer.printReport")}
        </button>
        <button onClick={() => report && printSessionReceipt(report, shop)} className="btn-secondary text-sm">
          {t("cashDrawer.printReceiptBtn")}
        </button>
        <button onClick={exportCsv} className="btn-secondary text-sm">
          {t("cashDrawer.exportCsv")}
        </button>
      </div>

      {/* Print header — shown only in print */}
      <div className="hidden print:block mb-6">
        <h1 className="text-2xl font-bold">{t("report.title")}</h1>
        <p className="text-gray-600">
          {fmtDateTime(session.openedAt)} — {session.openedBy.name}
        </p>
      </div>

      {/* 1. Session Header */}
      <div className="card p-5 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-gray-500 text-xs">{t("cashDrawer.openedAt")}</div>
            <div className="font-medium">{fmtDateTime(session.openedAt)}</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs">{t("cashDrawer.openedBy")}</div>
            <div className="font-medium">{session.openedBy.name}</div>
          </div>
          {session.closedAt && (
            <>
              <div>
                <div className="text-gray-500 text-xs">{t("cashDrawer.closedAt")}</div>
                <div className="font-medium">{fmtDateTime(session.closedAt)}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">{t("cashDrawer.closedBy")}</div>
                <div className="font-medium">{session.closedBy?.name ?? "—"}</div>
              </div>
            </>
          )}
        </div>
        <div className="mt-3">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${session.status === "OPEN" ? "bg-green-200 text-green-800" : "bg-gray-200 text-gray-600"}`}>
            {session.status === "OPEN" ? t("cashDrawer.sessionOpen") : t("cashDrawer.sessionClosed")}
          </span>
        </div>
      </div>

      {/* 2. Revenue Summary */}
      <div className="card p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">{t("report.revenueSummary")}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-gray-500 text-xs">{t("report.visitsList")}</div>
            <div className="text-xl font-bold">{summary.visitCount}</div>
          </div>
          <div className="bg-green-50 rounded-lg p-3">
            <div className="text-gray-500 text-xs">{t("cashDrawer.cashSales")}</div>
            <div className="text-xl font-bold text-green-700">{fmtCurrency(summary.cashTotal)}</div>
          </div>
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="text-gray-500 text-xs">{t("cashDrawer.cardSales")}</div>
            <div className="text-xl font-bold text-blue-700">{fmtCurrency(summary.cardTotal)}</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-3">
            <div className="text-gray-500 text-xs">
              {t("cashDrawer.mixedSales")} ({t("common.cash")})
            </div>
            <div className="text-xl font-bold text-purple-700">{fmtCurrency(summary.mixedCashAmount)}</div>
          </div>
          <div className="bg-red-50 rounded-lg p-3">
            <div className="text-gray-500 text-xs">{t("reports.discounts")}</div>
            <div className="text-xl font-bold text-red-600">-{fmtCurrency(summary.discountsTotal)}</div>
          </div>
        </div>
      </div>

      {/* 3a. Card account — collected by machine, so it never reaches the drawer */}
      {(summary.cardSales > 0 || summary.visaCommission > 0) && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">{t("finance.cardAccount")}</h2>
          <div className="space-y-2 text-sm max-w-sm">
            <div className="flex justify-between text-gray-600">
              <span>{t("cashDrawer.cardSales")}</span>
              <span className="text-blue-700 tabular-nums">+{fmtCurrency(summary.cardSales)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>
                {t("cashDrawer.visaCommission")}
                <span className="text-gray-400"> ({summary.visaPercent}%)</span>
              </span>
              <span className="text-red-600 tabular-nums">-{fmtCurrency(summary.visaCommission)}</span>
            </div>
            {summary.cardExpenses > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>{t("cashDrawer.cardExpenses")}</span>
                <span className="text-red-600 tabular-nums">-{fmtCurrency(summary.cardExpenses)}</span>
              </div>
            )}
            {summary.cardAdvances > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>{t("cashDrawer.advances")}</span>
                <span className="text-red-600 tabular-nums">-{fmtCurrency(summary.cardAdvances)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-200">
              <span>{t("cashDrawer.cardNet")}</span>
              <span className="text-blue-700 tabular-nums">{fmtCurrency(summary.cardNet)}</span>
            </div>
          </div>
        </div>
      )}

      {/* 3. Cash Reconciliation */}
      <div className="card p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">{t("report.cashReconciliation")}</h2>
        <div className="space-y-2 text-sm max-w-sm">
          <div className="flex justify-between text-gray-600">
            <span>{t("cashDrawer.openingBalance")}</span>
            <span>{fmtCurrency(session.openingCash)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>{t("cashDrawer.cashSales")}</span>
            <span className="text-green-700">+{fmtCurrency(summary.cashSales)}</span>
          </div>
          {summary.cashIn > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>{t("cashDrawer.cashIn")}</span>
              <span className="text-green-700">+{fmtCurrency(summary.cashIn)}</span>
            </div>
          )}
          {summary.cashOut > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>{t("cashDrawer.cashOut")}</span>
              <span className="text-red-600">-{fmtCurrency(summary.cashOut)}</span>
            </div>
          )}
          {summary.cashAdvances > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>{t("cashDrawer.advances")}</span>
              <span className="text-red-600">-{fmtCurrency(summary.cashAdvances)}</span>
            </div>
          )}
          {summary.cashExpenses > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>{t("cashDrawer.cashExpenses")}</span>
              <span className="text-red-600">-{fmtCurrency(summary.cashExpenses)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-200">
            <span>{t("cashDrawer.expectedCash")}</span>
            <span>{fmtCurrency(summary.expectedCash)}</span>
          </div>
          {summary.countedCash !== null && (
            <>
              <div className="flex justify-between text-gray-600">
                <span>{t("cashDrawer.countedCash")}</span>
                <span>{fmtCurrency(summary.countedCash)}</span>
              </div>
              <div className={`flex justify-between font-bold pt-2 border-t border-gray-200 ${summary.difference !== null && summary.difference >= 0 ? "text-green-600" : "text-red-600"}`}>
                <span>{t("cashDrawer.difference")}</span>
                <span>
                  {summary.difference !== null
                    ? `${summary.difference >= 0 ? "+" : ""}${fmtCurrency(summary.difference)} (${summary.difference >= 0 ? t("cashDrawer.over") : t("cashDrawer.short")})`
                    : "—"}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 4. Revenue per Barber */}
      {revenuePerBarber.length > 0 && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">{t("report.revenuePerBarber")}</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="th-start px-3 py-2 font-medium text-gray-600">{t("field.barber")}</th>
                <th className="text-center px-3 py-2 font-medium text-gray-600">{t("common.visits")}</th>
                <th className="text-end px-3 py-2 font-medium text-gray-600">{t("field.total")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {revenuePerBarber.map((b) => (
                <tr key={b.barberId}>
                  <td className="px-3 py-2 font-medium text-gray-900">{b.name}</td>
                  <td className="px-3 py-2 text-center text-gray-600">{b.visits}</td>
                  <td className="px-3 py-2 text-end font-semibold text-green-600">{fmtCurrency(b.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 5. Top Services */}
      {topServices.length > 0 && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">{t("report.topServices")}</h2>
          <div className="space-y-2">
            {topServices.map((s, idx) => (
              <div key={s.serviceId} className="flex items-center gap-3 text-sm">
                <span className="text-xs font-bold text-gray-400 w-5">{t("common.hash")}{idx + 1}</span>
                <div className="flex-1 font-medium text-gray-900">{s.name}</div>
                <span className="font-semibold text-primary-600">{s.count}{t("common.x")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. Visits List */}
      {visits.length > 0 && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">{t("report.visitsList")}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="th-start px-3 py-2 font-medium text-gray-600">{t("customers.title")}</th>
                  <th className="th-start px-3 py-2 font-medium text-gray-600">{t("field.barber")}</th>
                  <th className="th-start px-3 py-2 font-medium text-gray-600">{t("field.services")}</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-600">{t("field.paymentMethod")}</th>
                  <th className="text-end px-3 py-2 font-medium text-gray-600">{t("field.total")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visits.map((v) => (
                  <tr key={v.id}>
                    <td className="px-3 py-2 font-medium text-gray-900">
                      {fmtCustomerName(v.customer.name)}
                      <div className="text-xs text-gray-400">{fmtTime(v.visitAt)}</div>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{v.barber?.name ?? "—"}</td>
                    <td className="px-3 py-2 text-gray-600 text-xs">
                      {v.items.map((i) => `${i.service.name}×${i.quantity}`).join(", ")}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        v.paymentMethod === "CASH" ? "bg-green-100 text-green-700"
                        : v.paymentMethod === "CARD" ? "bg-blue-100 text-blue-700"
                        : "bg-purple-100 text-purple-700"
                      }`}>
                        {v.paymentMethod}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-end font-semibold text-gray-900">{fmtCurrency(v.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7. Movements List */}
      {movements.length > 0 && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">{t("report.movementsList")}</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-center px-3 py-2 font-medium text-gray-600">Type</th>
                <th className="th-start px-3 py-2 font-medium text-gray-600">{t("field.reason")}</th>
                <th className="th-start px-3 py-2 font-medium text-gray-600">{t("common.by")}</th>
                <th className="text-end px-3 py-2 font-medium text-gray-600">{t("field.amount")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {movements.map((m) => (
                <tr key={m.id}>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${m.type === "IN" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {m.type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-900">{m.reason}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{m.createdBy.name} · {fmtTime(m.createdAt)}</td>
                  <td className={`px-3 py-2 text-end font-semibold ${m.type === "IN" ? "text-green-600" : "text-red-600"}`}>
                    {m.type === "IN" ? "+" : "-"}{fmtCurrency(m.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
