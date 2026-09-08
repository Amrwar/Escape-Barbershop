"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import { useTranslation } from "@/lib/i18n";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { Icon } from "@/components/ui/Icon";
import { ADMIN_NAV, tillNavFor, isItemActive, sideForPath, type Side } from "@/lib/nav";

/**
 * Two sides, two chromes. The till is white and roomy because it is used at the
 * counter on a phone; admin is dark and dense because it is a back-office desk.
 * An owner can cross between them; a cashier never sees the admin chrome at all.
 */

function UserFooter({ dark }: { dark: boolean }) {
  const { data: session } = useSession();
  const { t } = useTranslation();
  const role = session?.user?.role;

  return (
    <div className={`px-4 py-4 border-t space-y-3 ${dark ? "border-white/10" : "border-gray-100"}`}>
      <LanguageToggle />

      <Link
        href="/account"
        className={`flex items-center gap-3 rounded-lg px-2 py-1.5 -mx-2 transition-colors ${
          dark ? "hover:bg-white/10" : "hover:bg-gray-50"
        }`}
        title={t("account.title")}
      >
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
            dark ? "bg-white/10 text-white" : "bg-primary-100 text-primary-700"
          }`}
        >
          {session?.user?.name?.[0]?.toUpperCase() ?? "?"}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium truncate ${dark ? "text-white" : "text-gray-900"}`}>
            {session?.user?.name}
          </div>
          <div className={`text-xs ${dark ? "text-primary-300" : "text-gray-500"}`}>
            {role === "OWNER" ? t("common.owner") : t("common.cashier")}
          </div>
        </div>
      </Link>

      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className={`w-full text-start text-sm rounded-lg px-2 py-1.5 transition-colors ${
          dark ? "text-red-300 hover:bg-white/10" : "text-red-600 hover:bg-red-50"
        }`}
      >
        {t("auth.signOut")}
      </button>
    </div>
  );
}

/** Owner-only bridge between the two sides. */
function SideSwitch({ to, onClose }: { to: Side; onClose?: () => void }) {
  const { t } = useTranslation();
  const { data: session } = useSession();
  if (session?.user?.role !== "OWNER") return null;

  return to === "till" ? (
    <Link
      href="/visits/new"
      onClick={onClose}
      className="flex items-center justify-center gap-2 mx-3 mb-3 px-3 py-2 rounded-lg text-sm font-medium bg-white/10 text-white hover:bg-white/20 transition-colors"
    >
      <Icon name="drawer" /> {t("nav.goToTill")}
    </Link>
  ) : (
    <Link
      href="/admin"
      onClick={onClose}
      className="flex items-center justify-center gap-2 mx-3 mb-3 px-3 py-2 rounded-lg text-sm font-medium bg-primary-900 text-white hover:bg-primary-800 transition-colors"
    >
      <Icon name="shield" /> {t("nav.backToAdmin")}
    </Link>
  );
}

function TillSidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { data: session } = useSession();
  const items = tillNavFor(session?.user?.role);

  return (
    <div className="flex flex-col h-full bg-white border-e border-gray-200 w-64">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100">
        <Image src="/logo.jpg" alt="Escape Barbershop" width={44} height={44} className="rounded-lg shrink-0" />
        <div>
          <div className="font-bold text-gray-900 text-sm leading-tight tracking-[0.12em] uppercase">Escape</div>
          <div className="text-[11px] text-primary-500 font-semibold tracking-[0.18em] uppercase">{t("nav.till")}</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scroll-clean">
        {items.map((item) => {
          const active = isItemActive(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-primary-50 text-primary-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <Icon name={item.icon} />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>

      <SideSwitch to="admin" onClose={onClose} />
      <UserFooter dark={false} />
    </div>
  );
}

function AdminSidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <div className="flex flex-col h-full bg-primary-900 w-64">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
        <Image src="/logo.jpg" alt="Escape Barbershop" width={44} height={44} className="rounded-lg shrink-0" />
        <div>
          <div className="font-bold text-white text-sm leading-tight tracking-[0.12em] uppercase">Escape</div>
          <div className="text-[11px] text-primary-300 font-semibold tracking-[0.18em] uppercase">{t("nav.admin")}</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto scroll-clean">
        {ADMIN_NAV.map((group) => (
          <div key={group.titleKey}>
            <div className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary-400">
              {t(group.titleKey)}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isItemActive(item.href, pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={`flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? "bg-white text-primary-900 shadow-sm"
                        : "text-primary-200 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Icon name={item.icon} />
                    {t(item.labelKey)}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <SideSwitch to="till" onClose={onClose} />
      <UserFooter dark />
    </div>
  );
}

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  // A cashier is always on the till side, whatever the URL says.
  const side: Side = session?.user?.role === "OWNER" ? sideForPath(pathname) : "till";
  return side === "admin" ? <AdminSidebar onClose={onClose} /> : <TillSidebar onClose={onClose} />;
}

export function SidebarShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { data: session } = useSession();
  const { t } = useTranslation();
  const side: Side = session?.user?.role === "OWNER" ? sideForPath(pathname) : "till";
  const dark = side === "admin";

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar — appears on inline-start (left in LTR, right in RTL) */}
      <aside className="hidden lg:flex flex-shrink-0">
        <Sidebar />
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden flex rtl:flex-row-reverse">
          <aside className="flex flex-shrink-0 h-full z-50">
            <Sidebar onClose={() => setOpen(false)} />
          </aside>
          <div
            className="flex-1 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Mobile header — carries the same colour as the side you are on */}
        <div
          className={`lg:hidden flex items-center gap-3 px-4 py-3 border-b ${
            dark ? "bg-primary-900 border-white/10" : "bg-white border-gray-200"
          }`}
        >
          <button
            onClick={() => setOpen(true)}
            className={`p-2 rounded-lg ${
              dark ? "text-primary-200 hover:bg-white/10" : "text-gray-500 hover:bg-gray-100"
            }`}
            aria-label="Open menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Image src="/logo.jpg" alt="Escape Barbershop" width={28} height={28} className="rounded-md" />
            <span className={`font-semibold truncate ${dark ? "text-white" : "text-gray-900"}`}>
              Escape {dark ? t("nav.admin") : t("nav.till")}
            </span>
          </div>
          <LanguageToggle />
        </div>

        <main className={`flex-1 overflow-y-auto ${dark ? "bg-gray-50" : ""}`}>{children}</main>
      </div>
    </div>
  );
}
