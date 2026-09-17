"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useTranslation } from "@/lib/i18n";
import { Icon, type IconName } from "@/components/ui/Icon";
import { LanguageToggle } from "@/components/ui/LanguageToggle";

/**
 * The barber's chrome. Dark and phone-sized like the customer app, because it
 * lives in a pocket rather than on a counter — but it carries their name and
 * their work, not the shop's.
 */

const TABS: {
  href: string;
  labelKey: "barberApp.navToday" | "barberApp.navEarnings" | "barberApp.navReviews";
  icon: IconName;
}[] = [
  { href: "/barber", labelKey: "barberApp.navToday", icon: "calendar" },
  { href: "/barber/earnings", labelKey: "barberApp.navEarnings", icon: "wallet" },
  { href: "/barber/reviews", labelKey: "barberApp.navReviews", icon: "star" },
];

export function BarberShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { data: session } = useSession();

  return (
    <div className="min-h-screen bg-primary-950 text-white">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-56 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(207,162,67,0.10),transparent_70%)]" />

      <header className="relative mx-auto flex max-w-2xl items-center gap-3 px-5 pt-5 pb-1">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-brass-300/80">Escape</div>
          <div className="text-sm font-semibold text-white">{session?.user?.name ?? t("barberApp.title")}</div>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <LanguageToggle />
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="rounded-lg px-2 py-1.5 text-xs text-white/40 transition-colors hover:bg-white/5 hover:text-white/80"
          >
            {t("auth.signOut")}
          </button>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-2xl px-5 pb-28 pt-3">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-primary-950/85 backdrop-blur-lg pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-2xl grid-cols-3">
          {TABS.map((tab) => {
            const active = tab.href === "/barber" ? pathname === "/barber" : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`relative flex flex-col items-center gap-1 py-3 text-[11px] font-medium transition-colors ${
                  active ? "text-brass-300" : "text-white/40 hover:text-white/70"
                }`}
              >
                {active && <span className="absolute inset-x-10 top-0 h-px bg-brass-400/70" />}
                <Icon name={tab.icon} className="h-5 w-5" />
                {t(tab.labelKey)}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
