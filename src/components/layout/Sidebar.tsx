"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import { useTranslation } from "@/lib/i18n";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import type { TranslationKey } from "../../../messages/en";

const NAV_ITEMS: {
  href: string;
  labelKey: TranslationKey;
  icon: string;
  roles: string[];
}[] = [
  { href: "/dashboard",   labelKey: "nav.dashboard",  icon: "📊", roles: ["OWNER","CASHIER"] },
  { href: "/visits/new",  labelKey: "nav.newVisit",   icon: "➕", roles: ["OWNER","CASHIER"] },
  { href: "/visits",      labelKey: "nav.visits",     icon: "📋", roles: ["OWNER","CASHIER"] },
  { href: "/reports",     labelKey: "nav.reports",    icon: "📈", roles: ["OWNER","CASHIER"] },
  { href: "/customers",   labelKey: "nav.customers",  icon: "👥", roles: ["OWNER","CASHIER"] },
  { href: "/services",    labelKey: "nav.services",   icon: "✂️", roles: ["OWNER"] },
  { href: "/barbers",     labelKey: "nav.barbers",    icon: "💈", roles: ["OWNER"] },
  { href: "/salaries",    labelKey: "nav.salaries",   icon: "💰", roles: ["OWNER"] },
  { href: "/attendance",  labelKey: "nav.attendance", icon: "📅", roles: ["OWNER","CASHIER"] },
  { href: "/expenses",    labelKey: "nav.expenses",   icon: "💸", roles: ["OWNER","CASHIER"] },
  { href: "/settings/receipt", labelKey: "nav.settings", icon: "⚙️", roles: ["OWNER"] },
];

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { t, lang } = useTranslation();
  const role = session?.user?.role;

  const filtered = NAV_ITEMS.filter((item) => role && item.roles.includes(role));

  return (
    <div className="flex flex-col h-full bg-white border-e border-gray-200 w-64">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100">
        <Image
          src="/logo.jpg"
          alt="Escape Barbershop"
          width={44}
          height={44}
          className="rounded-lg shrink-0"
        />
        <div>
          <div className="font-bold text-gray-900 text-sm leading-tight">Escape</div>
          <div className="text-xs text-primary-600 font-medium">Barbershop</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {filtered.map((item) => {
          const isActive =
            item.href === "/visits/new"
              ? pathname === "/visits/new"
              : item.href === "/visits"
              ? pathname === "/visits" ||
                (pathname.startsWith("/visits/") && pathname !== "/visits/new")
              : pathname === item.href || pathname.startsWith(item.href + "/");

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary-50 text-primary-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <span className="text-base shrink-0">{item.icon}</span>
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>

      {/* Language toggle + user */}
      <div className="px-4 py-4 border-t border-gray-100 space-y-3">
        <LanguageToggle />

        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-sm shrink-0">
            {session?.user?.name?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">
              {session?.user?.name}
            </div>
            <div className="text-xs text-gray-500 capitalize">
              {role === "OWNER" ? t("common.owner") : t("common.cashier")}
            </div>
          </div>
        </div>

        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full text-start text-sm text-red-600 hover:bg-red-50 rounded-lg px-2 py-1.5 transition-colors"
        >
          {t("auth.signOut")}
        </button>
      </div>
    </div>
  );
}

export function SidebarShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

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
        {/* Mobile header */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white">
          <button
            onClick={() => setOpen(true)}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
            aria-label="Open menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex items-center gap-2 flex-1">
            <Image src="/logo.jpg" alt="Escape Barbershop" width={28} height={28} className="rounded-md" />
            <span className="font-semibold text-gray-900">Escape Barbershop</span>
          </div>
          <LanguageToggle />
        </div>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
