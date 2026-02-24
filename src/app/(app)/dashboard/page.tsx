"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatCard } from "@/components/ui/StatCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/lib/i18n";

interface DrawerStatus {
  isOpen: boolean;
  expectedCash?: number;
  openSessionId?: string;
  lastDifference?: number;
}

interface DashboardData {
  todayRevenue: number;
  monthRevenue: number;
  visitsToday: number;
  visitsThisMonth: number;
  topServices: { serviceId: string; name: string; arabicName: string | null; count: number }[];
  revenuePerBarber: { barberId: string; name: string; revenue: number; visits: number }[];
  drawerStatus: DrawerStatus;
}

export default function DashboardPage() {
  const { t, fmtCurrency, lang } = useTranslation();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => { if (d && !d.error) setData(d); })
      .finally(() => setLoading(false));
  }, []);

  const now = new Date();
  const monthName = now.toLocaleString("default", { month: "long", year: "numeric" });

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title={t("dashboard.title")}
        subtitle={`${t("dashboard.overviewFor")} ${monthName}`}
      />

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-5 animate-pulse h-24 bg-gray-100" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <StatCard title={t("dashboard.todayRevenue")}   value={`$${fmtCurrency(data?.todayRevenue ?? 0)}`}   icon="💵" color="green"  />
            <StatCard title={t("dashboard.monthRevenue")}   value={`$${fmtCurrency(data?.monthRevenue ?? 0)}`}   icon="📈" color="purple" />
            <StatCard title={t("dashboard.visitsToday")}    value={data?.visitsToday ?? 0}                        icon="✂️" color="blue"   />
            <StatCard title={t("dashboard.visitsThisMonth")} value={data?.visitsThisMonth ?? 0}                   icon="📋" color="yellow" />
          </div>

          {/* Cash Drawer Tile */}
          {data?.drawerStatus && (
            <div className={`card p-4 mb-8 border-2 ${data.drawerStatus.isOpen ? "border-green-300 bg-green-50" : "border-gray-200"}`}>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🗃️</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 text-sm">
                        {data.drawerStatus.isOpen ? t("dashboard.drawerOpen") : t("dashboard.drawerClosed")}
                      </span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${data.drawerStatus.isOpen ? "bg-green-200 text-green-800" : "bg-gray-200 text-gray-600"}`}>
                        {data.drawerStatus.isOpen ? "OPEN" : "CLOSED"}
                      </span>
                    </div>
                    {data.drawerStatus.isOpen && data.drawerStatus.expectedCash !== undefined && (
                      <div className="text-sm text-green-700 font-medium">
                        {t("dashboard.expectedCash")}: ${fmtCurrency(data.drawerStatus.expectedCash)}
                      </div>
                    )}
                    {!data.drawerStatus.isOpen && data.drawerStatus.lastDifference !== undefined && (
                      <div className={`text-sm font-medium ${data.drawerStatus.lastDifference >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {t("dashboard.lastDifference")}: {data.drawerStatus.lastDifference >= 0 ? "+" : ""}${fmtCurrency(data.drawerStatus.lastDifference)}
                      </div>
                    )}
                  </div>
                </div>
                <Link href="/cash-drawer" className="btn-secondary text-xs whitespace-nowrap">
                  {data.drawerStatus.isOpen ? t("dashboard.closeDay") : t("dashboard.openDrawer")}
                </Link>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Services */}
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">
                {t("dashboard.topServices")}
              </h2>
              {!data?.topServices.length ? (
                <p className="text-sm text-gray-400">{t("common.noData")}</p>
              ) : (
                <div className="space-y-3">
                  {data.topServices.map((s, idx) => (
                    <div key={s.serviceId} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-gray-400 w-5">
                        {t("common.hash")}{idx + 1}
                      </span>
                      <div className="flex-1 min-w-0 truncate text-sm font-medium text-gray-900">
                        {lang === "ar" && s.arabicName ? s.arabicName : s.name}
                      </div>
                      <span className="text-sm font-semibold text-primary-600 shrink-0">
                        {s.count}{t("common.x")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Revenue per barber */}
            {data && data.revenuePerBarber.length > 0 && (
              <div className="card p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-4">
                  {t("dashboard.revenuePerBarber")}
                </h2>
                <div className="space-y-3">
                  {data.revenuePerBarber.map((b) => (
                    <div key={b.barberId} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-xs shrink-0">
                        {b.name[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">{b.name}</div>
                        <div className="text-xs text-gray-500">
                          {b.visits} {b.visits === 1 ? t("common.visit") : t("common.visits")}
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-green-600 shrink-0">
                        ${fmtCurrency(b.revenue)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
