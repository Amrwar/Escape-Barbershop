"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/lib/i18n";
import { format, startOfDay, startOfWeek, startOfMonth } from "date-fns";

interface VisitItem {
  service: { name: string };
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
  count: number;
  revenue: number;
}

interface Penalty {
  id: string;
  date: string;
  barberName: string;
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
  topServices: TopService[];
}

interface ReportData {
  visits: Visit[];
  summary: Summary;
  penalties: Penalty[];
}

interface SalarySettings {
  baseSalary: number;
  commissionType: "PERCENT" | "FIXED_PER_VISIT";
  commissionValue: number;
}

interface Barber {
  id: string;
  name: string;
  salarySettings: SalarySettings | null;
}

type Preset = "today" | "week" | "month" | "custom";

function getPresetRange(preset: Preset): { from: string; to: string } {
  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");
  if (preset === "today") return { from: todayStr, to: todayStr };
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

export default function BarberStatsPage() {
  const params = useParams();
  const barberId = params.id as string;
  const { t, fmtCurrency, fmtDateTime, fmtDate } = useTranslation();

  const [barber, setBarber] = useState<Barber | null>(null);
  const [preset, setPreset] = useState<Preset>("month");
  const initial = getPresetRange("month");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  // Load barber info once
  useEffect(() => {
    fetch("/api/barbers")
      .then((r) => r.json())
      .then((list: Barber[]) => {
        const found = list.find((b) => b.id === barberId);
        if (found) setBarber(found);
      });
  }, [barberId]);

  const handlePreset = (p: Preset) => {
    setPreset(p);
    if (p !== "custom") {
      const range = getPresetRange(p);
      setFrom(range.from);
      setTo(range.to);
    }
  };

  const fetchReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        from: startOfDay(new Date(from)).toISOString(),
        to: new Date(to + "T23:59:59").toISOString(),
        barberId,
      });
      const res = await fetch(`/api/reports?${params}`);
      if (res.ok) {
        setData(await res.json());
      }
    } finally {
      setLoading(false);
      setFetched(true);
    }
  };

  // Compute salary estimate from data + barber settings
  const salaryEstimate = (() => {
    if (!data || !barber?.salarySettings) return null;
    const s = barber.salarySettings;
    const revenue = data.summary.totalRevenue;
    const visitCount = data.summary.visitCount;
    let commission = 0;
    if (s.commissionType === "PERCENT") {
      commission = (revenue * s.commissionValue) / 100;
    } else {
      commission = visitCount * s.commissionValue;
    }
    const gross = s.baseSalary + commission;
    const penaltiesTotal = data.penalties.reduce((sum, p) => sum + p.amount, 0);
    const net = gross - penaltiesTotal;
    return { commission, gross, penaltiesTotal, net, baseSalary: s.baseSalary };
  })();

  const handleExport = async () => {
    if (!data || !barber) return;
    const { downloadExcel } = await import("@/lib/excel");
    const periodLabel = `${from} to ${to}`;

    const summaryRows = [
      { Field: "Barber", Value: barber.name },
      { Field: "Period", Value: periodLabel },
      { Field: t("reports.totalRevenue"), Value: data.summary.totalRevenue },
      { Field: t("reports.cashRevenue"), Value: data.summary.cashTotal },
      { Field: t("reports.cardRevenue"), Value: data.summary.cardTotal },
      { Field: t("reports.mixedRevenue"), Value: data.summary.mixedTotal },
      { Field: t("reports.discounts"), Value: data.summary.discountsTotal },
      { Field: "Visits", Value: data.summary.visitCount },
      ...(salaryEstimate
        ? [
            {},
            { Field: "Salary Estimate", Value: "" },
            { Field: "Base Salary", Value: salaryEstimate.baseSalary },
            { Field: "Commission", Value: salaryEstimate.commission },
            { Field: "Gross", Value: salaryEstimate.gross },
            { Field: "Penalties", Value: salaryEstimate.penaltiesTotal },
            { Field: "Net", Value: salaryEstimate.net },
          ]
        : []),
      {},
      { Field: "Top Services", Value: "" },
      ...data.summary.topServices.map((s) => ({ Field: s.name, Value: s.count, Revenue: s.revenue })),
    ];

    const visitsRows = data.visits.map((v) => ({
      Date: new Date(v.visitAt).toLocaleString(),
      Customer: v.customer.name,
      Services: v.items.map((i) => `${i.service.name}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`).join(", "),
      Payment: paymentLabel[v.paymentMethod] ?? v.paymentMethod,
      Subtotal: v.items.reduce((s, i) => s + i.priceAtTime * i.quantity, 0),
      "Discount%": v.discount,
      Total: v.total,
    }));

    const perBarberRows = [
      {
        Barber: barber.name,
        Visits: data.summary.visitCount,
        Revenue: data.summary.totalRevenue,
      },
    ];

    const penaltiesRows = data.penalties.map((p) => ({
      Date: new Date(p.date).toLocaleDateString(),
      Barber: p.barberName,
      Amount: p.amount,
      Reason: p.reason,
    }));

    downloadExcel(`report-${barber.name.replace(/\s+/g, "-")}-${from}-to-${to}.xlsx`, [
      { name: "Summary", rows: summaryRows },
      { name: "Visits", rows: visitsRows },
      { name: "Per Barber", rows: perBarberRows },
      { name: "Penalties", rows: penaltiesRows },
    ]);
  };

  const hasData = data && data.visits.length > 0;
  const topService = data?.summary.topServices[0];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-4">
        <Link href="/barbers" className="text-sm text-primary-600 hover:underline">
          ← {t("action.back")} {t("nav.barbers")}
        </Link>
      </div>

      <PageHeader
        title={barber ? barber.name : "…"}
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
          <button onClick={handleExport} disabled={!hasData} className="btn-secondary">
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
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <SummaryCard label={t("reports.totalRevenue")} value={`$${fmtCurrency(data.summary.totalRevenue)}`} accent />
            <SummaryCard label={t("common.visits")} value={String(data.summary.visitCount)} />
            {topService && <SummaryCard label="Top Service" value={topService.name} />}
          </div>

          {/* Salary estimate */}
          {salaryEstimate && (
            <div className="card p-4">
              <div className="font-semibold text-gray-700 mb-3">{t("reports.salaryEstimate")}</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-gray-500 text-xs mb-1">{t("salaries.base")}</div>
                  <div className="font-semibold">${fmtCurrency(salaryEstimate.baseSalary)}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs mb-1">{t("salaries.commission")}</div>
                  <div className="font-semibold">${fmtCurrency(salaryEstimate.commission)}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs mb-1">{t("salaries.gross")}</div>
                  <div className="font-semibold">${fmtCurrency(salaryEstimate.gross)}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs mb-1">{t("salaries.net")}</div>
                  <div className={`font-bold text-lg ${salaryEstimate.net >= 0 ? "text-green-600" : "text-red-600"}`}>
                    ${fmtCurrency(salaryEstimate.net)}
                  </div>
                </div>
              </div>
              {salaryEstimate.penaltiesTotal > 0 && (
                <div className="mt-2 text-xs text-red-500">
                  {t("salaries.penalties")}: -${fmtCurrency(salaryEstimate.penaltiesTotal)}
                </div>
              )}
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
                      <td className="px-4 py-2 text-gray-600 text-xs">
                        {v.items.map((i) => `${i.service.name}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`).join(", ")}
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
                    <th className="text-end px-4 py-2 font-medium text-gray-500">{t("field.amount")}</th>
                    <th className="th-start px-4 py-2 font-medium text-gray-500">{t("field.reason")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.penalties.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-500 text-xs">{fmtDate(p.date)}</td>
                      <td className="px-4 py-2 text-end font-medium text-red-600">${fmtCurrency(p.amount)}</td>
                      <td className="px-4 py-2 text-gray-600">{p.reason}</td>
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

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`card p-4 ${accent ? "border-primary-200 bg-primary-50" : ""}`}>
      <div className={`text-xs font-medium mb-1 ${accent ? "text-primary-600" : "text-gray-500"}`}>{label}</div>
      <div className={`text-xl font-bold ${accent ? "text-primary-700" : "text-gray-900"}`}>{value}</div>
    </div>
  );
}
