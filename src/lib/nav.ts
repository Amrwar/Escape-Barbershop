import type { TranslationKey } from "../../messages/en";
import type { IconName } from "@/components/ui/Icon";

/**
 * The app has two separate sides.
 *
 *  - The **till** is the floor: serving a customer, the drawer, a day expense,
 *    issuing stock to the branch. The cashier lives here and sees nothing else.
 *  - **Admin** is the owner side: money, payroll, warehouse, setup.
 *
 * The route decides which side you are on, and a route belongs to exactly one
 * side *per role* — otherwise a shared screen like Expenses would sit in both
 * menus and flip the chrome under the owner as they navigate. So the shared
 * screens are admin for the owner and till for the cashier, and each menu is
 * filtered to match.
 */
export type Side = "till" | "admin";

export interface NavItem {
  href: string;
  labelKey: TranslationKey;
  icon: IconName;
  /** Shown only to the cashier: for the owner these live in the admin menu. */
  cashierOnly?: boolean;
}

const TILL_NAV_ALL: NavItem[] = [
  { href: "/visits/new", labelKey: "nav.newVisit", icon: "plus" },
  { href: "/visits", labelKey: "nav.visits", icon: "list" },
  { href: "/cash-drawer", labelKey: "nav.cashDrawer", icon: "drawer" },
  { href: "/expenses", labelKey: "nav.expenses", icon: "banknote", cashierOnly: true },
  { href: "/issue-notes", labelKey: "nav.transfers", icon: "tray-up", cashierOnly: true },
];

export function tillNavFor(role: string | undefined): NavItem[] {
  return role === "OWNER" ? TILL_NAV_ALL.filter((i) => !i.cashierOnly) : TILL_NAV_ALL;
}

export interface NavGroup {
  titleKey: TranslationKey;
  items: NavItem[];
}

export const ADMIN_NAV: NavGroup[] = [
  {
    titleKey: "admin.sectionMoney",
    items: [
      { href: "/admin", labelKey: "nav.admin", icon: "shield" },
      { href: "/dashboard", labelKey: "nav.dashboard", icon: "chart-bar" },
      { href: "/reports", labelKey: "nav.reports", icon: "chart-line" },
      { href: "/cash-drawer/day-report", labelKey: "cashDrawer.dayReport", icon: "receipt" },
      { href: "/admin/activity", labelKey: "nav.activity", icon: "clipboard-check" },
      { href: "/admin/discounts", labelKey: "nav.discounts", icon: "banknote" },
      { href: "/expenses", labelKey: "nav.expenses", icon: "banknote" },
      { href: "/advances", labelKey: "nav.advances", icon: "hand-coins" },
    ],
  },
  {
    titleKey: "admin.sectionTeam",
    items: [
      { href: "/salaries", labelKey: "nav.salaries", icon: "wallet" },
      { href: "/attendance", labelKey: "nav.attendance", icon: "calendar" },
      { href: "/barbers", labelKey: "nav.barbers", icon: "users" },
    ],
  },
  {
    titleKey: "admin.sectionStock",
    items: [
      { href: "/warehouse", labelKey: "nav.warehouse", icon: "box" },
      { href: "/warehouse/purchases", labelKey: "nav.purchases", icon: "receipt" },
      { href: "/warehouse/suppliers", labelKey: "nav.suppliers", icon: "truck" },
      { href: "/issue-notes", labelKey: "nav.transfers", icon: "tray-up" },
      { href: "/warehouse/count", labelKey: "nav.stockCount", icon: "clipboard-check" },
    ],
  },
  {
    titleKey: "admin.sectionSetup",
    items: [
      { href: "/appointments", labelKey: "nav.appointments", icon: "calendar" },
      { href: "/settings/booking", labelKey: "nav.bookingSettings", icon: "cog" },
      { href: "/services", labelKey: "nav.services", icon: "scissors" },
      { href: "/customers", labelKey: "nav.customers", icon: "users" },
      { href: "/inventory", labelKey: "nav.inventory", icon: "pie" },
      { href: "/settings/receipt", labelKey: "nav.settings", icon: "cog" },
      { href: "/settings/finance", labelKey: "finance.visaCommission", icon: "card" },
      { href: "/account", labelKey: "nav.accounts", icon: "users" },
    ],
  },
];

/** Owner routes that render in admin chrome. Everything else is the till. */
const ADMIN_PREFIXES = [
  "/admin",
  "/dashboard",
  "/reports",
  "/salaries",
  "/advances",
  "/warehouse",
  "/barbers",
  "/services",
  "/customers",
  "/inventory",
  "/attendance",
  "/settings",
  "/expenses",
  "/issue-notes",
  "/account",
  "/cash-drawer/day-report",
  "/cash-drawer/report",
];

export function sideForPath(pathname: string): Side {
  return ADMIN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))
    ? "admin"
    : "till";
}

/** Where each role starts after signing in. */
export function landingFor(role: string | undefined): string {
  return role === "OWNER" ? "/admin" : "/visits/new";
}

export function isItemActive(href: string, pathname: string): boolean {
  // A few routes need exact matching so two items never light up together.
  if (href === "/visits/new") return pathname === "/visits/new";
  if (href === "/visits") {
    return pathname === "/visits" || (pathname.startsWith("/visits/") && pathname !== "/visits/new");
  }
  if (href === "/cash-drawer") return pathname === "/cash-drawer";
  if (href === "/warehouse") return pathname === "/warehouse";
  if (href === "/admin") return pathname === "/admin";
  if (href === "/settings/receipt") return pathname === "/settings/receipt";
  return pathname === href || pathname.startsWith(href + "/");
}
