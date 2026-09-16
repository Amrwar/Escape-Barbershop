"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslation } from "@/lib/i18n";
import { Icon, type IconName } from "@/components/ui/Icon";
import { LanguageToggle } from "@/components/ui/LanguageToggle";

/**
 * The customer's app: a dark header carrying the shop's name, the page itself
 * on a light background, and a bar along the bottom for thumbs on a phone.
 * The login page opts out of the chrome — it has its own full-screen look.
 */

const TABS: { href: string; labelKey: "app.navHome" | "app.navBook" | "app.navAppointments" | "app.navProfile"; icon: IconName }[] = [
  { href: "/app", labelKey: "app.navHome", icon: "scissors" },
  { href: "/app/book", labelKey: "app.navBook", icon: "plus" },
  { href: "/app/appointments", labelKey: "app.navAppointments", icon: "calendar" },
  { href: "/app/profile", labelKey: "app.navProfile", icon: "users" },
];

export function CustomerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { data: session } = useSession();

  if (pathname.startsWith("/app/login")) return <>{children}</>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-gradient-to-b from-primary-900 to-primary-950 text-white">
        <div className="max-w-2xl mx-auto px-5 py-4 flex items-center gap-3">
          <Link href="/app" className="flex items-center gap-3">
            <Image src="/logo.jpg" alt="Escape Barbershop" width={36} height={36} className="rounded-lg" />
            <div>
              <div className="text-sm font-bold tracking-[0.2em] uppercase">Escape</div>
              <div className="text-[11px] text-primary-300">{t("app.tagline")}</div>
            </div>
          </Link>
          <div className="ms-auto flex items-center gap-2">
            <LanguageToggle />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-5 py-6 pb-24">{children}</main>

      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-2xl mx-auto grid grid-cols-4">
          {TABS.map((tab) => {
            const active = tab.href === "/app" ? pathname === "/app" : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                  active ? "text-primary-800" : "text-gray-400 hover:text-gray-600"
                }`}
              >
                <Icon name={tab.icon} className={active ? "w-5 h-5" : "w-5 h-5 opacity-70"} />
                {t(tab.labelKey)}
              </Link>
            );
          })}
        </div>
      </nav>

      {session?.user?.name && <span className="sr-only">{session.user.name}</span>}
    </div>
  );
}
