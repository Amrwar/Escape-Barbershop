"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/lib/i18n";

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
    mixedCashAmount: number;
    discountsTotal: number;
    cashIn: number;
    cashOut: number;
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
  const { t, fmtCurrency } = useTranslation();
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
        v.barber.name,
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
            subtitle={`${new Date(session.openedAt).toLocaleDateString()} · ${session.openedBy.name}`}
          />
        </div>
        <button onClick={() => window.print()} className="btn-secondary text-sm">
          {t("cashDrawer.printReport")}
        </button>
        <button onClick={exportCsv} className="btn-secondary text-sm">
          {t("cashDrawer.exportCsv")}
        </button>
      </div>

      {/* Print header — shown only in print */}
      <div className="hidden print:block mb-6">
        <h1 className="text-2xl font-bold">{t("report.title")}</h1>
        <p className="text-gray-600">
          {new Date(session.openedAt).toLocaleString()} — {session.openedBy.name}
        </p>
      </div>

      {/* 1. Session Header */}
      <div className="card p-5 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-gray-500 text-xs">{t("cashDrawer.openedAt")}</div>
            <div className="font-medium">{new Date(session.openedAt).toLocaleString()}</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs">{t("cashDrawer.openedBy")}</div>
            <div className="font-medium">{session.openedBy.name}</div>
          </div>
          {session.closedAt && (
            <>
              <div>
                <div className="text-gray-500 text-xs">{t("cashDrawer.closedAt")}</div>
                <div className="font-medium">{new Date(session.closedAt).toLocaleString()}</div>
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
            <div className="text-xl font-bold text-green-700">${fmtCurrency(summary.cashTotal)}</div>
          </div>
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="text-gray-500 text-xs">{t("cashDrawer.cardSales")}</div>
            <div className="text-xl font-bold text-blue-700">${fmtCurrency(summary.cardTotal)}</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-3">
            <div className="text-gray-500 text-xs">{t("cashDrawer.mixedSales")} (cash part)</div>
            <div className="text-xl font-bold text-purple-700">${fmtCurrency(summary.mixedCashAmount)}</div>
          </div>
          <div className="bg-red-50 rounded-lg p-3">
            <div className="text-gray-500 text-xs">{t("field.discount")}s</div>
            <div className="text-xl font-bold text-red-600">-${fmtCurrency(summary.discountsTotal)}</div>
          </div>
        </div>
      </div>

      {/* 3. Cash Reconciliation */}
      <div className="card p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">{t("report.cashReconciliation")}</h2>
        <div className="space-y-2 text-sm max-w-sm">
          <div className="flex justify-between text-gray-600">
            <span>{t("cashDrawer.openingBalance")}</span>
            <span>${fmtCurrency(session.openingCash)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>{t("cashDrawer.cashSales")}</span>
            <span className="text-green-700">+${fmtCurrency(summary.cashSales)}</span>
          </div>
          {summary.cashIn > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>{t("cashDrawer.cashIn")}</span>
              <span className="text-green-700">+${fmtCurrency(summary.cashIn)}</span>
            </div>
          )}
          {summary.cashOut > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>{t("cashDrawer.cashOut")}</span>
              <span className="text-red-600">-${fmtCurrency(summary.cashOut)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-200">
            <span>{t("cashDrawer.expectedCash")}</span>
            <span>${fmtCurrency(summary.expectedCash)}</span>
          </div>
          {summary.countedCash !== null && (
            <>
              <div className="flex justify-between text-gray-600">
                <span>{t("cashDrawer.countedCash")}</span>
                <span>${fmtCurrency(summary.countedCash)}</span>
              </div>
              <div className={`flex justify-between font-bold pt-2 border-t border-gray-200 ${summary.difference !== null && summary.difference >= 0 ? "text-green-600" : "text-red-600"}`}>
                <span>{t("cashDrawer.difference")}</span>
                <span>
                  {summary.difference !== null
                    ? `${summary.difference >= 0 ? "+" : ""}$${fmtCurrency(summary.difference)} (${summary.difference >= 0 ? t("cashDrawer.over") : t("cashDrawer.short")})`
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
                  <td className="px-3 py-2 text-end font-semibold text-green-600">${fmtCurrency(b.revenue)}</td>
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
                      {v.customer.name}
                      <div className="text-xs text-gray-400">{new Date(v.visitAt).toLocaleTimeString()}</div>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{v.barber.name}</td>
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
                    <td className="px-3 py-2 text-end font-semibold text-gray-900">${fmtCurrency(v.total)}</td>
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
                  <td className="px-3 py-2 text-gray-500 text-xs">{m.createdBy.name} · {new Date(m.createdAt).toLocaleTimeString()}</td>
                  <td className={`px-3 py-2 text-end font-semibold ${m.type === "IN" ? "text-green-600" : "text-red-600"}`}>
                    {m.type === "IN" ? "+" : "-"}${fmtCurrency(m.amount)}
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
