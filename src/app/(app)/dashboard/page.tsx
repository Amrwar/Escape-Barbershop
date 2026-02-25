"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { StatCard } from "@/components/ui/StatCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/lib/i18n";
import { format, startOfDay, startOfWeek, startOfMonth } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashboardData {
  todayRevenue: number;
  monthRevenue: number;
  visitsToday: number;
  visitsThisMonth: number;
  topServices: { serviceId: string; name: string; arabicName: string | null; count: number }[];
  revenuePerBarber: { barberId: string; name: string; revenue: number; visits: number }[];
}

interface Barber { id: string; name: string; }

interface BarberStatsItem {
  service: { name: string; arabicName: string | null };
  quantity: number;
  priceAtTime: number;
}

interface BarberStatsVisit {
  id: string;
  visitAt: string;
  paymentMethod: "CASH" | "CARD" | "MIXED";
  discount: number;
  total: number;
  cashAmount: number | null;
  cardAmount: number | null;
  customer: { name: string };
  items: BarberStatsItem[];
}

interface BarberStats {
  visits: BarberStatsVisit[];
  summary: {
    visitCount: number;
    totalRevenue: number;
    cashTotal: number;
    cardTotal: number;
    mixedTotal: number;
    discountsTotal: number;
    topServices: { name: string; arabicName: string | null; count: number; revenue: number }[];
  };
}

type Period = "today" | "week" | "month";

function getPeriodRange(period: Period): { from: string; to: string } {
  const now = new Date();
  const today = format(now, "yyyy-MM-dd");
  if (period === "today") return { from: today, to: today };
  if (period === "week") {
    const monday = startOfWeek(now, { weekStartsOn: 1 });
    return { from: format(monday, "yyyy-MM-dd"), to: today };
  }
  const first = startOfMonth(now);
  return { from: format(first, "yyyy-MM-dd"), to: today };
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { t, fmtCurrency, fmtDateTime, lang } = useTranslation();
  const { data: session } = useSession();
  const isBarber = session?.user?.role === "BARBER";

  const [activeTab, setActiveTab] = useState<"overview" | "barbers">("overview");

  // Overview tab
  const [data, setData] = useState<DashboardData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  // Barbers tab
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [barbersLoading, setBarbersLoading] = useState(false);
  const [barbersLoaded, setBarbersLoaded] = useState(false);
  const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null);
  const [period, setPeriod] = useState<Period>("month");
  const [statsLoading, setStatsLoading] = useState(false);
  const [stats, setStats] = useState<BarberStats | null>(null);
  const [exporting, setExporting] = useState(false);

  const now = new Date();
  const monthName = now.toLocaleString("default", { month: "long", year: "numeric" });
  const subtitle = isBarber && session?.user?.name
    ? `${session.user.name} — ${t("dashboard.overviewFor")} ${monthName}`
    : `${t("dashboard.overviewFor")} ${monthName}`;

  // Load overview data
  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => { if (d && !d.error) setData(d); })
      .finally(() => setOverviewLoading(false));
  }, []);

  // Load barbers list when switching to barbers tab
  const loadBarbers = useCallback(() => {
    if (barbersLoaded) return;
    setBarbersLoading(true);
    fetch("/api/barbers?active=true")
      .then((r) => r.json())
      .then((d) => setBarbers(Array.isArray(d) ? d : []))
      .finally(() => { setBarbersLoading(false); setBarbersLoaded(true); });
  }, [barbersLoaded]);

  // Load stats for selected barber + period
  const loadStats = useCallback((barber: Barber, p: Period) => {
    setStatsLoading(true);
    setStats(null);
    const range = getPeriodRange(p);
    const params = new URLSearchParams({
      barberId: barber.id,
      from: startOfDay(new Date(range.from)).toISOString(),
      to: new Date(range.to + "T23:59:59").toISOString(),
    });
    fetch(`/api/barber-stats?${params}`)
      .then((r) => r.json())
      .then((d) => { if (!d.error) setStats(d); })
      .finally(() => setStatsLoading(false));
  }, []);

  const handleTabChange = (tab: "overview" | "barbers") => {
    setActiveTab(tab);
    if (tab === "barbers") loadBarbers();
  };

  const handleBarberSelect = (barber: Barber) => {
    setSelectedBarber(barber);
    loadStats(barber, period);
  };

  const handlePeriodChange = (p: Period) => {
    setPeriod(p);
    if (selectedBarber) loadStats(selectedBarber, p);
  };

  const handleExport = async () => {
    if (!stats || !selectedBarber) return;
    setExporting(true);
    try {
      const { downloadBarberExcel } = await import("@/lib/excel");
      const range = getPeriodRange(period);
      const periodLabel =
        period === "today" ? "Today"
        : period === "week" ? "This Week"
        : "This Month";

      const visitRows = stats.visits.map((v) => {
        const subtotal = v.items.reduce((s, i) => s + i.priceAtTime * i.quantity, 0);
        return {
          visitAt: v.visitAt,
          customerName: v.customer.name,
          services: v.items
            .map((i) => `${i.service.name}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`)
            .join(", "),
          paymentMethod:
            v.paymentMethod === "CASH" ? "Cash"
            : v.paymentMethod === "CARD" ? "Card"
            : "Mixed",
          cashAmount: v.cashAmount,
          cardAmount: v.cardAmount,
          subtotal,
          discountPercent: v.discount,
          total: v.total,
        };
      });

      downloadBarberExcel(
        `${selectedBarber.name.replace(/\s+/g, "-")}-${period}-stats.xlsx`,
        {
          barberName: selectedBarber.name,
          period: `${periodLabel} (${range.from} to ${range.to})`,
          summary: stats.summary,
          visits: visitRows,
        }
      );
    } finally {
      setExporting(false);
    }
  };

  const periodLabel: Record<Period, string> = {
    today: t("reports.today"),
    week: t("reports.thisWeek"),
    month: t("reports.thisMonth"),
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader title={t("dashboard.title")} subtitle={subtitle} />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <button
          onClick={() => handleTabChange("overview")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "overview"
              ? "border-primary-600 text-primary-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {t("dashboard.title")}
        </button>
        <button
          onClick={() => handleTabChange("barbers")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "barbers"
              ? "border-primary-600 text-primary-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {t("nav.barbers")}
        </button>
      </div>

      {/* ── Overview Tab ── */}
      {activeTab === "overview" && (
        overviewLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="card p-5 animate-pulse h-24 bg-gray-100" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatCard title={t("dashboard.todayRevenue")}    value={`$${fmtCurrency(data?.todayRevenue ?? 0)}`}    icon="💵" color="green"  />
              <StatCard title={t("dashboard.monthRevenue")}    value={`$${fmtCurrency(data?.monthRevenue ?? 0)}`}    icon="📈" color="purple" />
              <StatCard title={t("dashboard.visitsToday")}     value={data?.visitsToday ?? 0}                         icon="✂️" color="blue"   />
              <StatCard title={t("dashboard.visitsThisMonth")} value={data?.visitsThisMonth ?? 0}                     icon="📋" color="yellow" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="card p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-4">{t("dashboard.topServices")}</h2>
                {!data?.topServices.length ? (
                  <p className="text-sm text-gray-400">{t("common.noData")}</p>
                ) : (
                  <div className="space-y-3">
                    {data.topServices.map((s, idx) => (
                      <div key={s.serviceId} className="flex items-center gap-3">
                        <span className="text-xs font-bold text-gray-400 w-5">{t("common.hash")}{idx + 1}</span>
                        <div className="flex-1 min-w-0 truncate text-sm font-medium text-gray-900">
                          {lang === "ar" && s.arabicName ? s.arabicName : s.name}
                        </div>
                        <span className="text-sm font-semibold text-primary-600 shrink-0">{s.count}{t("common.x")}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {data && data.revenuePerBarber.length > 0 && (
                <div className="card p-5">
                  <h2 className="text-sm font-semibold text-gray-900 mb-4">{t("dashboard.revenuePerBarber")}</h2>
                  <div className="space-y-3">
                    {data.revenuePerBarber.map((b) => (
                      <div key={b.barberId} className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-xs shrink-0">
                          {b.name[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900">{b.name}</div>
                          <div className="text-xs text-gray-500">{b.visits} {b.visits === 1 ? t("common.visit") : t("common.visits")}</div>
                        </div>
                        <span className="text-sm font-semibold text-green-600 shrink-0">${fmtCurrency(b.revenue)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )
      )}

      {/* ── Barbers Tab ── */}
      {activeTab === "barbers" && (
        <div className="space-y-5">

          {/* Period selector */}
          <div className="flex gap-2 items-center flex-wrap">
            <span className="text-sm text-gray-500 font-medium me-1">{t("field.date")}:</span>
            {(["today", "week", "month"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => handlePeriodChange(p)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  period === p
                    ? "bg-primary-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {periodLabel[p]}
              </button>
            ))}
          </div>

          {/* Barber list */}
          {barbersLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="card p-4 h-16 animate-pulse bg-gray-100" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {barbers.map((b) => (
                <button
                  key={b.id}
                  onClick={() => handleBarberSelect(b)}
                  className={`card p-4 text-start transition-all hover:shadow-md ${
                    selectedBarber?.id === b.id
                      ? "border-primary-400 bg-primary-50 ring-2 ring-primary-200"
                      : "hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-sm shrink-0">
                      {b.name[0]?.toUpperCase()}
                    </div>
                    <div className="text-sm font-semibold text-gray-900 truncate">{b.name}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Stats panel */}
          {selectedBarber && (
            <div>
              {/* Header row */}
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <h2 className="text-base font-semibold text-gray-900">
                  {selectedBarber.name} — {periodLabel[period]}
                </h2>
                {stats && stats.summary.visitCount > 0 && (
                  <button
                    onClick={handleExport}
                    disabled={exporting}
                    className="btn-secondary text-sm"
                  >
                    {exporting ? "…" : `⬇ ${t("reports.exportExcel")}`}
                  </button>
                )}
              </div>

              {statsLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="card p-4 h-16 animate-pulse bg-gray-100" />
                  ))}
                </div>
              ) : !stats || stats.summary.visitCount === 0 ? (
                <div className="card p-8 text-center text-gray-400">
                  <div className="text-3xl mb-2">📋</div>
                  <div className="text-sm">{t("reports.noData")}</div>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Summary cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <SummaryCard label={t("common.visits")}        value={String(stats.summary.visitCount)}              accent />
                    <SummaryCard label={t("reports.totalRevenue")} value={`$${fmtCurrency(stats.summary.totalRevenue)}`} accent />
                    <SummaryCard label={t("common.cash")}          value={`$${fmtCurrency(stats.summary.cashTotal)}`}     />
                    <SummaryCard label={t("common.card")}          value={`$${fmtCurrency(stats.summary.cardTotal)}`}     />
                    <SummaryCard label={t("common.mixed")}         value={`$${fmtCurrency(stats.summary.mixedTotal)}`}    />
                    <SummaryCard label={t("reports.discounts")}    value={`$${fmtCurrency(stats.summary.discountsTotal)}`} />
                  </div>

                  {/* Top services */}
                  {stats.summary.topServices.length > 0 && (
                    <div className="card overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">
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
                          {stats.summary.topServices.map((s, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                              <td className="px-4 py-2 font-medium">
                                {lang === "ar" && s.arabicName ? s.arabicName : s.name}
                              </td>
                              <td className="px-4 py-2 text-end text-gray-600">{s.count}</td>
                              <td className="px-4 py-2 text-end font-semibold text-green-600">
                                ${fmtCurrency(s.revenue)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Visits table */}
                  <div className="card overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">
                      {t("reports.visitsList")} ({stats.visits.length})
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="th-start px-4 py-2 font-medium text-gray-500">{t("field.dateTime")}</th>
                            <th className="th-start px-4 py-2 font-medium text-gray-500">{t("customers.title")}</th>
                            <th className="th-start px-4 py-2 font-medium text-gray-500">{t("field.services")}</th>
                            <th className="th-start px-4 py-2 font-medium text-gray-500">{t("field.paymentMethod")}</th>
                            <th className="text-end px-4 py-2 font-medium text-gray-500">{t("field.total")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {stats.visits.map((v) => (
                            <tr key={v.id} className="hover:bg-gray-50">
                              <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">
                                {fmtDateTime(v.visitAt)}
                              </td>
                              <td className="px-4 py-2 font-medium text-gray-900">{v.customer.name}</td>
                              <td className="px-4 py-2 text-xs text-gray-600">
                                {v.items.map((i) =>
                                  `${lang === "ar" && i.service.arabicName ? i.service.arabicName : i.service.name}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`
                                ).join(", ")}
                              </td>
                              <td className="px-4 py-2 text-gray-600">
                                {v.paymentMethod === "CASH" ? t("common.cash")
                                  : v.paymentMethod === "CARD" ? t("common.card")
                                  : t("common.mixed")}
                              </td>
                              <td className="px-4 py-2 text-end font-semibold text-gray-900">
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
                </div>
              )}
            </div>
          )}

          {/* Empty prompt */}
          {!selectedBarber && !barbersLoading && barbers.length > 0 && (
            <div className="card p-8 text-center text-gray-400">
              <div className="text-3xl mb-2">💈</div>
              <div className="text-sm">{t("dashboard.barberSelectHint")}</div>
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
      <div className={`text-lg font-bold ${accent ? "text-primary-700" : "text-gray-900"}`}>{value}</div>
    </div>
  );
}
