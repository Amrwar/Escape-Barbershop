"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslation } from "@/lib/i18n";
import { Icon, type IconName } from "@/components/ui/Icon";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { ThemeToggle } from "@/components/customer/ThemeToggle";

/**
 * The customer app's chrome: black, quiet, and built for a thumb.
 *
 * The shop's own screens are white because they are worked on for eight hours;
 * this is opened for thirty seconds to book a haircut, so it can afford to look
 * like the shop feels. Colour is kept for one thing at a time — brass marks the
 * action, everything else is white at varying strength.
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
  const { status } = useSession();

  // Only once it is actually known. Treating "loading" as signed out would
  // flash a sign-in prompt at a customer who is already signed in.
  const signedOut = status === "unauthenticated";

  // The sign-in screen carries its own full-bleed look.
  if (pathname.startsWith("/app/login")) return <>{children}</>;

  return (
    <div className="escape-app min-h-screen bg-app text-ink">
      {/* A soft brass glow behind the header, so black does not read as flat */}
      <div className="pointer-events-none fixed inset-x-0 top-0 h-64 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(207,162,67,0.13),transparent_70%)]" />

      <header className="relative">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-5 pt-5 pb-2">
          {/* Home is behind the login, so for a visitor the way in is the way on. */}
          <Link
            href={signedOut ? "/app/login" : "/app"}
            className="flex items-center gap-3 transition-opacity active:opacity-70"
          >
            <Image src="/logo.jpg" alt="Escape Barbershop" width={38} height={38} className="rounded-[3px] ring-1 ring-hair" />
            <div className="leading-tight">
              <div className="text-sm font-bold uppercase tracking-[0.28em] text-ink">Escape</div>
              <div className="text-[11px] tracking-wide text-accent">{t("app.tagline")}</div>
            </div>
          </Link>
          <div className="ms-auto flex items-center gap-2">
            <ThemeToggle />
            <LanguageToggle tone="app" />
          </div>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-2xl px-5 pb-28 pt-2">{children}</main>

      {/*
        A visitor reading the price list or the roster has no account yet, so
        four tabs that all bounce them to a sign-in screen are four dead ends.
        They get the one thing they might actually want instead.
      */}
      {signedOut ? <VisitorBar /> : <TabBar pathname={pathname} />}
    </div>
  );
}

/** The way in, for somebody reading the price list before they have an account. */
function VisitorBar() {
  const { t } = useTranslation();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-hair bg-app px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
      <div className="mx-auto flex max-w-2xl items-center gap-3">
        <p className="min-w-0 flex-1 text-xs text-soft">{t("app.visitorHint")}</p>
        <Link href="/app/login" className="c-btn-primary shrink-0 px-5">
          {t("app.signIn")}
        </Link>
      </div>
    </nav>
  );
}

/** The four places a signed-in customer moves between. */
function TabBar({ pathname }: { pathname: string }) {
  const { t } = useTranslation();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-hair bg-app backdrop-blur-lg pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto grid max-w-2xl grid-cols-4">
        {TABS.map((tab) => {
          const active = tab.href === "/app" ? pathname === "/app" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`group relative flex flex-col items-center gap-1 py-3 text-[11px] font-medium transition-colors ${
                active ? "text-accent" : "text-soft hover:text-mid"
              }`}
            >
              {active && <span className="absolute inset-x-6 top-0 h-px bg-accent" />}
              <Icon name={tab.icon} className="h-5 w-5" />
              {t(tab.labelKey)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
