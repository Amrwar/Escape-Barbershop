"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n";
import { savingOf } from "@/lib/offers";
import { EmptyState, Pill, ScreenTitle, Skeleton } from "@/components/customer/kit";

interface Offer {
  id: string;
  title: string;
  titleAr: string | null;
  description: string | null;
  price: number | null;
  wasPrice: number | null;
  endsAt: string | null;
}

/** What the shop is running. Only offers that are live today reach this screen. */
export default function OffersPage() {
  const { t, fmtCurrency, fmtDate, lang } = useTranslation();
  const [offers, setOffers] = useState<Offer[] | null>(null);

  useEffect(() => {
    fetch("/api/customer/catalog")
      .then((r) => r.json())
      .then((d) => setOffers(Array.isArray(d?.offers) ? d.offers : []))
      .catch(() => setOffers([]));
  }, []);

  return (
    <div className="space-y-5 pt-2">
      <ScreenTitle title={t("app.offers")} hint={t("app.offersHint")} />

      {offers === null ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : offers.length === 0 ? (
        <EmptyState icon="receipt" title={t("app.noOffers")} hint={t("app.noOffersHint")} />
      ) : (
        <div className="space-y-3">
          {offers.map((o) => {
            const saving = savingOf(o);
            return (
              <div key={o.id} className="c-card-raised animate-fade-up overflow-hidden">
                <div className="flex items-start justify-between gap-4 p-5">
                  <div className="min-w-0">
                    <div className="text-lg font-semibold text-ink">{lang === "ar" && o.titleAr ? o.titleAr : o.title}</div>
                    {o.description && <p className="mt-1 text-sm text-soft">{o.description}</p>}
                    {o.endsAt && (
                      <p className="mt-2 text-[11px] text-faint">
                        {t("app.offerUntil")} {fmtDate(o.endsAt)}
                      </p>
                    )}
                  </div>
                  {o.price !== null && (
                    <div className="shrink-0 text-end">
                      <div className="c-display text-2xl tabular-nums text-accent">{fmtCurrency(o.price)}</div>
                      {o.wasPrice !== null && (
                        <div className="text-xs tabular-nums text-faint line-through">{fmtCurrency(o.wasPrice)}</div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between border-t border-hair px-5 py-3">
                  {saving !== null ? <Pill tone="brass">{t("app.save")} {fmtCurrency(saving)}</Pill> : <span />}
                  <Link href="/app/book" className="text-sm font-medium text-accent hover:text-accent">
                    {t("app.bookNow")} ›
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
