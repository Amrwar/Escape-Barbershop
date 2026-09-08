"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/lib/i18n";
import type { TranslationKey } from "../../../../messages/en";

interface DashboardStats {
  todayRevenue: number;
  todayCash: number;
  todayCard: number;
  todayExpenses: number;
  todayAdvances: number;
  todayVisaCommission: number;
  todayCardNet: number;
  visitsToday: number;
  visaPercent: number;
}

interface StockTotals {
  mainValue: number;
  branchValue: number;
  totalValue: number;
}

interface Tile {
  href: string;
  icon: string;
  labelKey: TranslationKey;
  descKey: TranslationKey;
}

const SECTIONS: { titleKey: TranslationKey; tiles: Tile[] }[] = [
  {
    titleKey: "admin.sectionMoney",
    tiles: [
      { href: "/reports", icon: "📈", labelKey: "nav.reports", descKey: "admin.descReports" },
      { href: "/cash-drawer/day-report", icon: "🧾", labelKey: "cashDrawer.dayReport", descKey: "admin.descDayReport" },
      { href: "/expenses", icon: "💸", labelKey: "nav.expenses", descKey: "admin.descExpenses" },
      { href: "/advances", icon: "🤝", labelKey: "nav.advances", descKey: "admin.descAdvances" },
    ],
  },
  {
    titleKey: "admin.sectionTeam",
    tiles: [
      { href: "/salaries", icon: "💰", labelKey: "nav.salaries", descKey: "admin.descSalaries" },
      { href: "/attendance", icon: "🗓️", labelKey: "nav.attendance", descKey: "admin.descAttendance" },
      { href: "/barbers", icon: "💈", labelKey: "nav.barbers", descKey: "admin.descBarbers" },
    ],
  },
  {
    titleKey: "admin.sectionStock",
    tiles: [
      { href: "/warehouse", icon: "📦", labelKey: "nav.warehouse", descKey: "admin.descWarehouse" },
      { href: "/warehouse/purchases", icon: "🧾", labelKey: "nav.purchases", descKey: "admin.descPurchases" },
      { href: "/warehouse/suppliers", icon: "🚚", labelKey: "nav.suppliers", descKey: "admin.descSuppliers" },
      { href: "/issue-notes", icon: "📤", labelKey: "nav.transfers", descKey: "admin.descTransfers" },
      { href: "/warehouse/count", icon: "🔢", labelKey: "nav.stockCount", descKey: "admin.descStockCount" },
    ],
  },
  {
    titleKey: "admin.sectionSetup",
    tiles: [
      { href: "/services", icon: "✂️", labelKey: "nav.services", descKey: "admin.descServices" },
      { href: "/customers", icon: "🧑", labelKey: "nav.customers", descKey: "admin.descCustomers" },
      { href: "/inventory", icon: "📊", labelKey: "nav.inventory", descKey: "admin.descInventory" },
      { href: "/settings/receipt", icon: "⚙️", labelKey: "nav.settings", descKey: "admin.descSettings" },
    ],
  },
];

export default function AdminPage() {
  const { t, fmtCurrency } = useTranslation();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [stock, setStock] = useState<StockTotals | null>(null);

  useEffect(() => {
    const tz = -new Date().getTimezoneOffset();
    fetch(`/api/dashboard?tz=${tz}`)
      .then((r) => r.json())
      .then((d) => setStats(d?.error ? null : d))
      .catch(() => setStats(null));
    fetch("/api/stock/balances")
      .then((r) => r.json())
      .then((d) => setStock(d?.totals ?? null))
      .catch(() => setStock(null));
  }, []);

  const money = (n: number | undefined) => fmtCurrency(n ?? 0);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <PageHeader title={t("admin.title")} subtitle={t("admin.subtitle")} />

      {/* Today at a glance — the numbers only an owner sees */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">{t("admin.today")}</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-gray-500">{t("admin.netRevenue")}</div>
            <div className="text-xl font-bold text-gray-900">{money(stats?.todayRevenue)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">{t("finance.cashAccount")}</div>
            <div className="text-xl font-bold text-green-700">{money(stats?.todayCash)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">
              {t("admin.cardNet")}
              {stats?.visaPercent ? (
                <span className="text-gray-400"> ({stats.visaPercent}%)</span>
              ) : null}
            </div>
            <div className="text-xl font-bold text-blue-700">{money(stats?.todayCardNet)}</div>
            {(stats?.todayVisaCommission ?? 0) > 0 && (
              <div className="text-xs text-gray-400">
                {t("admin.visaCommission")}: -{money(stats?.todayVisaCommission)}
              </div>
            )}
          </div>
          <div>
            <div className="text-xs text-gray-500">{t("admin.stockValue")}</div>
            <div className="text-xl font-bold text-gray-900">{money(stock?.totalValue)}</div>
            {stock && (
              <div className="text-xs text-gray-400">
                {t("warehouse.mainStore")} {money(stock.mainValue)} · {t("warehouse.branch")}{" "}
                {money(stock.branchValue)}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">{t("expenses.totalExpenses")}</span>
            <span className="font-medium text-red-600">-{money(stats?.todayExpenses)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{t("admin.advancesToday")}</span>
            <span className="font-medium text-gray-700">{money(stats?.todayAdvances)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{t("dashboard.visitsToday")}</span>
            <span className="font-medium text-gray-900">{stats?.visitsToday ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{t("finance.visaCommission")}</span>
            <Link href="/settings/finance" className="font-medium text-primary-600 hover:underline">
              {stats?.visaPercent ?? 0}%
            </Link>
          </div>
        </div>
      </div>

      {SECTIONS.map((section) => (
        <div key={section.titleKey}>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {t(section.titleKey)}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {section.tiles.map((tile) => (
              <Link
                key={tile.href}
                href={tile.href}
                className="card p-4 hover:border-primary-300 hover:shadow transition-all flex gap-3"
              >
                <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center text-xl shrink-0">
                  {tile.icon}
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 text-sm">{t(tile.labelKey)}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{t(tile.descKey)}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
