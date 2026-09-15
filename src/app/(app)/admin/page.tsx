"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/lib/i18n";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Note } from "@/components/ui/Note";
import { Badge } from "@/components/ui/Badge";
import type { TranslationKey } from "../../../../messages/en";

interface DashboardStats {
  todayRevenue: number;
  todayCash: number;
  todayCardNet: number;
  todayInstapayNet: number;
  todayInstapayExpenses: number;
  todayExpenses: number;
  todayVisaCommission: number;
  visitsToday: number;
  monthRevenue: number;
  monthExpenses: number;
  monthAdvances: number;
  monthVisaCommission: number;
  todayDiscounts: number;
  todayDiscountedVisits: number;
  monthDiscounts: number;
  monthDiscountedVisits: number;
  visitsThisMonth: number;
  visaPercent: number;
}

interface AuditRow {
  id: string;
  at: string;
  userName: string;
  userRole: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  entity: string;
  summary: string;
  amount: number | null;
}

interface StockRow {
  productId: string;
  name: string;
  total: number;
}

/** The things an owner actually comes here to *do*, not just navigate to. */
const QUICK_ACTIONS: { href: string; labelKey: TranslationKey; icon: IconName }[] = [
  { href: "/warehouse/purchases", labelKey: "purchases.newInvoice", icon: "receipt" },
  { href: "/issue-notes", labelKey: "transfers.newTransfer", icon: "tray-up" },
  { href: "/advances", labelKey: "advances.addAdvance", icon: "hand-coins" },
  { href: "/warehouse/count", labelKey: "stockCount.newCount", icon: "clipboard-check" },
  { href: "/expenses", labelKey: "expenses.addExpense", icon: "banknote" },
  { href: "/visits/new", labelKey: "action.newVisit", icon: "plus" },
];

function Figure({
  label,
  value,
  hint,
  tone = "plain",
  loading,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "plain" | "cash" | "card" | "instapay" | "cost";
  loading?: boolean;
}) {
  const toneClass = {
    plain: "text-gray-900",
    cash: "text-green-700",
    card: "text-blue-700",
    instapay: "text-purple-700",
    cost: "text-red-600",
  }[tone];

  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      {loading ? (
        <div className="h-7 w-24 bg-gray-100 rounded animate-pulse mt-1" />
      ) : (
        <div className={`text-xl font-bold tabular-nums ${toneClass}`}>{value}</div>
      )}
      {hint && !loading && <div className="text-[11px] text-gray-400 mt-0.5">{hint}</div>}
    </div>
  );
}

export default function AdminPage() {
  const { t, fmtCurrency } = useTranslation();
  const { status } = useSession();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [stock, setStock] = useState<{ rows: StockRow[]; totalValue: number } | null>(null);
  const [supplierDue, setSupplierDue] = useState<number | null>(null);
  const [activity, setActivity] = useState<AuditRow[]>([]);
  const [deletionsWeek, setDeletionsWeek] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Wait for the session cookie. Fetching during the redirect straight after
    // sign-in returns 401 and would quietly render every figure as zero.
    if (status !== "authenticated") return;

    const tz = -new Date().getTimezoneOffset();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    let alive = true;
    Promise.all([
      fetch(`/api/dashboard?tz=${tz}`).then((r) => r.json()).catch(() => null),
      fetch("/api/stock/balances").then((r) => r.json()).catch(() => null),
      fetch("/api/suppliers").then((r) => r.json()).catch(() => null),
      fetch("/api/audit?take=6").then((r) => r.json()).catch(() => null),
      fetch(`/api/audit?action=DELETE&from=${weekAgo}&take=500`).then((r) => r.json()).catch(() => null),
    ]).then(([dash, balances, suppliers, recent, deletes]) => {
      if (!alive) return;
      setStats(dash && !dash.error ? dash : null);
      setStock(
        balances && !balances.error
          ? { rows: Array.isArray(balances.rows) ? balances.rows : [], totalValue: balances.totals?.totalValue ?? 0 }
          : null
      );
      setSupplierDue(
        Array.isArray(suppliers)
          ? suppliers.reduce((s: number, x: { balance?: number }) => s + (x.balance ?? 0), 0)
          : null
      );
      setActivity(recent && Array.isArray(recent.rows) ? recent.rows : []);
      setDeletionsWeek(deletes?.counts?.DELETE ?? 0);
      setLoading(false);
    });

    return () => { alive = false; };
  }, [status]);

  const money = (n: number | undefined | null) => fmtCurrency(n ?? 0);
  // The action keys are shared with buttons that read "+ Add Expense"; the tile
  // already carries an icon, so drop the leading plus.
  const actionLabel = (key: TranslationKey) => t(key).replace(/^\+\s*/, "");
  // A zero cost is not bad news, so it should not shout in red.
  const costTone = (n: number | undefined | null) => ((n ?? 0) > 0 ? "cost" : "plain");
  const outOfStock = stock?.rows.filter((r) => r.total <= 0) ?? [];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title={t("admin.title")}
        subtitle={t("admin.subtitle")}
        action={
          <Link href="/visits/new" className="btn-secondary">
            <Icon name="drawer" /> {t("nav.goToTill")}
          </Link>
        }
      />

      {/* Today */}
      <div className="card p-5">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900">{t("admin.today")}</h2>
          <span className="text-xs text-gray-400">
            {stats?.visitsToday ?? 0} {t("common.visits")}
          </span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          <Figure loading={loading} label={t("admin.netRevenue")} value={money(stats?.todayRevenue)} />
          <Figure loading={loading} label={t("finance.cashAccount")} value={money(stats?.todayCash)} tone="cash" />
          <Figure
            loading={loading}
            label={t("admin.cardNet")}
            value={money(stats?.todayCardNet)}
            tone="card"
            hint={
              (stats?.todayVisaCommission ?? 0) > 0
                ? `${t("admin.visaCommission")} -${money(stats?.todayVisaCommission)}`
                : undefined
            }
          />
          <Figure
            loading={loading}
            label={t("admin.instapayNet")}
            value={money(stats?.todayInstapayNet)}
            tone="instapay"
            hint={
              (stats?.todayInstapayExpenses ?? 0) > 0
                ? `${t("cashDrawer.instapayExpenses")} -${money(stats?.todayInstapayExpenses)}`
                : t("cashDrawer.instapayHint")
            }
          />
          <Figure
            loading={loading}
            label={t("expenses.totalExpenses")}
            value={money(stats?.todayExpenses)}
            tone={costTone(stats?.todayExpenses)}
          />
          <Link href="/admin/discounts" className="block hover:opacity-80 transition-opacity">
            <Figure
              loading={loading}
              label={t("discounts.totalGiven")}
              value={money(stats?.todayDiscounts)}
              tone={costTone(stats?.todayDiscounts)}
              hint={`${stats?.todayDiscountedVisits ?? 0} ${t("common.visits")}`}
            />
          </Link>
        </div>
      </div>

      {/* Month to date */}
      <div className="card p-5">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900">{t("admin.monthToDate")}</h2>
          <span className="text-xs text-gray-400">
            {stats?.visitsThisMonth ?? 0} {t("common.visits")}
          </span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <Figure loading={loading} label={t("admin.netRevenue")} value={money(stats?.monthRevenue)} />
          <Figure
            loading={loading}
            label={t("admin.expenses")}
            value={money(stats?.monthExpenses)}
            tone={costTone(stats?.monthExpenses)}
          />
          <Figure
            loading={loading}
            label={t("admin.visaCommission")}
            value={money(stats?.monthVisaCommission)}
            tone={costTone(stats?.monthVisaCommission)}
            hint={`${stats?.visaPercent ?? 0}%`}
          />
          <Figure
            loading={loading}
            label={t("reports.advancesTotal")}
            value={money(stats?.monthAdvances)}
            hint={t("advances.recoveredIn")}
          />
          <Link href="/admin/discounts" className="block hover:opacity-80 transition-opacity">
            <Figure
              loading={loading}
              label={t("discounts.totalGiven")}
              value={money(stats?.monthDiscounts)}
              tone={(stats?.monthDiscounts ?? 0) > 0 ? "cost" : "plain"}
              hint={`${stats?.monthDiscountedVisits ?? 0} ${t("common.visits")}`}
            />
          </Link>
        </div>
      </div>

      {/* What needs attention */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link href="/warehouse/suppliers" className="card p-4 hover:border-primary-300 transition-colors">
          <div className="text-xs text-gray-500">{t("admin.supplierDue")}</div>
          <div
            className={`text-xl font-bold tabular-nums ${
              (supplierDue ?? 0) > 0 ? "text-amber-700" : "text-gray-900"
            }`}
          >
            {money(supplierDue)}
          </div>
        </Link>

        <Link href="/warehouse" className="card p-4 hover:border-primary-300 transition-colors">
          <div className="text-xs text-gray-500">{t("admin.stockAlerts")}</div>
          {outOfStock.length > 0 ? (
            <>
              <div className="text-xl font-bold text-red-600 tabular-nums">{outOfStock.length}</div>
              <div className="text-[11px] text-gray-400 mt-0.5 truncate">
                {outOfStock.slice(0, 3).map((r) => r.name).join(", ")}
              </div>
            </>
          ) : (
            <>
              <div className="text-xl font-bold text-gray-900">—</div>
              <div className="text-[11px] text-gray-400 mt-0.5">{t("admin.allStocked")}</div>
            </>
          )}
        </Link>

        <Link href="/warehouse" className="card p-4 hover:border-primary-300 transition-colors">
          <div className="text-xs text-gray-500">{t("admin.stockValue")}</div>
          <div className="text-xl font-bold text-gray-900 tabular-nums">{money(stock?.totalValue)}</div>
        </Link>
      </div>

      {/* What changed, so a removal is never invisible */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{t("admin.recentActivity")}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {t("admin.deletionsWeek")}:{" "}
              <span className={deletionsWeek > 0 ? "font-semibold text-red-600" : "font-semibold text-gray-700"}>
                {deletionsWeek}
              </span>
            </p>
          </div>
          <Link href="/admin/activity" className="btn-secondary text-sm">
            {t("admin.viewActivity")}
          </Link>
        </div>

        {activity.length === 0 ? (
          <div className="px-5 py-6 text-sm text-gray-400 text-center">{t("admin.noActivity")}</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {activity.map((a) => (
              <li
                key={a.id}
                className={`px-5 py-3 flex items-center gap-3 text-sm ${a.action === "DELETE" ? "bg-red-50/40" : ""}`}
              >
                <Badge variant={a.action === "DELETE" ? "red" : a.action === "UPDATE" ? "yellow" : "green"}>
                  {a.action === "DELETE"
                    ? t("activity.deleted")
                    : a.action === "UPDATE"
                    ? t("activity.edited")
                    : t("activity.added")}
                </Badge>
                <span className="text-gray-500 text-xs shrink-0">
                  {t(`activity.entity.${a.entity}` as TranslationKey)}
                </span>
                <span className="flex-1 min-w-0 truncate text-gray-900">{a.summary}</span>
                <span className="text-xs text-gray-400 shrink-0">{a.userName}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="px-5 py-3 border-t border-gray-100">
          <Note tone="info" title={t("activity.noteTitle")} icon="list">
            {t("admin.activityHint")}
          </Note>
        </div>
      </div>

      {/* Quick actions — the menu already handles navigation, so these are jobs */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          {t("admin.quickActions")}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {QUICK_ACTIONS.map((a) => (
            <Link
              key={a.labelKey}
              href={a.href}
              className="card px-4 py-3 flex items-center gap-3 hover:border-primary-300 hover:shadow transition-all"
            >
              <span className="w-9 h-9 rounded-lg bg-primary-50 text-primary-700 flex items-center justify-center">
                <Icon name={a.icon} />
              </span>
              <span className="font-medium text-gray-900 text-sm">{actionLabel(a.labelKey)}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
