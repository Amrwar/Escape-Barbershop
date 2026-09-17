"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useTranslation } from "@/lib/i18n";

/**
 * The screen on the wall.
 *
 * Read from across a room by somebody who is bored, so: enormous type, no
 * chrome, no navigation, and never a scrollbar — anything that does not fit is
 * simply not shown rather than hidden below a fold nobody can reach.
 *
 * It refreshes itself every twenty seconds. A barbershop television is left on
 * for ten hours, so it must survive the network dropping without ever showing
 * an error page: a failed refresh keeps the last good picture.
 */

interface Chair {
  id: string;
  name: string;
  barber: string | null;
  endAt: string;
  services: string[];
}

interface Waiting {
  id: string;
  position: number;
  name: string;
  barber: string | null;
  waitMinutes: number;
}

interface Offer {
  id: string;
  title: string;
  titleAr: string | null;
  price: number | null;
  wasPrice: number | null;
}

const REFRESH_MS = 20_000;

export default function WallPage() {
  const { t, lang, fmtCurrency } = useTranslation();
  const [board, setBoard] = useState<{ inChair: Chair[]; waiting: Waiting[]; offers: Offer[] } | null>(null);
  const [clock, setClock] = useState<string>("");
  const [offline, setOffline] = useState(false);

  const load = useCallback(() => {
    fetch("/api/wall")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no"))))
      .then((d) => {
        setBoard(d);
        setOffline(false);
      })
      // Keep the last good picture rather than blanking the wall.
      .catch(() => setOffline(true));
  }, []);

  useEffect(() => {
    load();
    const refresh = setInterval(load, REFRESH_MS);
    const tick = setInterval(
      () =>
        setClock(
          new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-GB", {
            timeZone: "Africa/Cairo",
            hour: "2-digit",
            minute: "2-digit",
            hour12: lang !== "ar",
          }).format(new Date())
        ),
      1000
    );
    return () => {
      clearInterval(refresh);
      clearInterval(tick);
    };
  }, [load, lang]);

  // Only what fits on a screen, never a scrollbar nobody can reach.
  const inChair = (board?.inChair ?? []).slice(0, 4);
  const waiting = (board?.waiting ?? []).slice(0, 6);
  const offers = (board?.offers ?? []).slice(0, 3);

  return (
    <div className="escape-app relative flex h-screen flex-col overflow-hidden bg-app text-ink">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(60%_100%_at_50%_0%,var(--c-glow),transparent_70%)]" />

      <header className="relative flex items-center justify-between px-10 pt-8">
        <div className="flex items-center gap-4">
          <Image src="/logo.jpg" alt="" width={56} height={56} className="rounded-[3px]" />
          <div>
            <div className="text-2xl font-bold uppercase tracking-[0.3em] text-ink">Escape</div>
            <div className="text-sm tracking-wide text-accent">{t("wall.tagline")}</div>
          </div>
        </div>
        <div className="flex items-center gap-5">
          {offline && <span className="text-sm text-faint">{t("wall.offline")}</span>}
          <div className="c-display text-5xl tabular-nums text-ink">{clock}</div>
        </div>
      </header>

      <main className="relative grid flex-1 grid-cols-1 gap-8 px-10 py-8 lg:grid-cols-[1.4fr_1fr]">
        <section className="flex min-h-0 flex-col">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.3em] text-faint">{t("wall.inChair")}</h2>

          {inChair.length === 0 ? (
            <div className="flex flex-1 items-center justify-center border border-dashed border-hair">
              <p className="text-2xl text-faint">{t("wall.allFree")}</p>
            </div>
          ) : (
            <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
              {inChair.map((chair) => (
                <div key={chair.id} className="c-card-raised flex flex-col justify-between p-6">
                  <div>
                    <div className="text-4xl font-bold leading-tight text-ink">{chair.name}</div>
                    {chair.barber && <div className="mt-2 text-xl text-accent">{chair.barber}</div>}
                  </div>
                  <div className="mt-4 text-base text-soft">{chair.services.join(" + ")}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="flex min-h-0 flex-col">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.3em] text-faint">{t("wall.waiting")}</h2>

          {waiting.length === 0 ? (
            <div className="flex flex-1 items-center justify-center border border-dashed border-hair">
              <p className="text-2xl text-faint">{t("wall.noQueue")}</p>
            </div>
          ) : (
            <ol className="flex flex-col gap-3">
              {waiting.map((person) => (
                <li key={person.id} className="c-card flex items-center gap-5 px-6 py-4">
                  <span className="c-display w-10 shrink-0 text-3xl text-accent">{person.position}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-2xl font-semibold text-ink">{person.name}</span>
                    {person.barber && <span className="block text-base text-soft">{person.barber}</span>}
                  </span>
                  <span className="shrink-0 text-end">
                    <span className="c-display block text-2xl tabular-nums text-ink">{person.waitMinutes}</span>
                    <span className="block text-[11px] uppercase tracking-[0.18em] text-faint">{t("wall.minutes")}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>

      {offers.length > 0 && (
        <footer className="relative border-t border-hair px-10 py-5">
          <div className="flex flex-wrap items-center gap-x-12 gap-y-3">
            <span className="text-xs font-bold uppercase tracking-[0.3em] text-faint">{t("wall.today")}</span>
            {offers.map((offer) => (
              <span key={offer.id} className="flex items-baseline gap-3">
                <span className="text-xl text-ink">{lang === "ar" && offer.titleAr ? offer.titleAr : offer.title}</span>
                {offer.price !== null && (
                  <>
                    <span className="c-display text-2xl text-accent">{fmtCurrency(offer.price)}</span>
                    {offer.wasPrice !== null && (
                      <span className="text-base text-faint line-through">{fmtCurrency(offer.wasPrice)}</span>
                    )}
                  </>
                )}
              </span>
            ))}
          </div>
        </footer>
      )}
    </div>
  );
}
