"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n";
import { EmptyState, ScreenTitle, SectionTitle, Skeleton } from "@/components/customer/kit";
import { Stars } from "@/components/customer/Stars";

/**
 * What a barber's own customers said about them — the same words the app shows,
 * so nothing here is a surprise, and nothing the owner has taken down.
 */

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  name: string;
}

export default function BarberReviewsPage() {
  const { t, fmtDate } = useTranslation();
  const [data, setData] = useState<{ summary: { average: number | null; count: number }; reviews: Review[] } | null>(null);

  useEffect(() => {
    fetch("/api/barber/reviews")
      .then((r) => r.json())
      .then((d) => setData(d?.error ? null : d))
      .catch(() => setData(null));
  }, []);

  if (!data) {
    return (
      <div className="space-y-3 pt-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const withWords = data.reviews.filter((r) => r.comment);

  return (
    <div className="space-y-6 pt-2">
      <ScreenTitle title={t("barberApp.navReviews")} hint={t("barberApp.reviewsHint")} />

      <section className="c-card-raised animate-fade-up p-6 text-center">
        <div className="text-5xl font-bold tabular-nums leading-none text-white">
          {data.summary.average?.toFixed(1) ?? "—"}
        </div>
        <div className="mt-3 flex justify-center">
          <Stars rating={data.summary.average} size={20} />
        </div>
        <div className="mt-2 text-xs text-white/40">
          {t("barberApp.outOfReviews").replace("{count}", String(data.summary.count))}
        </div>
      </section>

      {withWords.length === 0 ? (
        <EmptyState icon="star" title={t("app.noReviews")} hint={t("barberApp.noReviewsHint")} />
      ) : (
        <section>
          <SectionTitle>{t("app.reviews")}</SectionTitle>
          <div className="space-y-2">
            {withWords.map((r) => (
              <div key={r.id} className="c-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-white/85">{r.name}</div>
                    <div className="text-[11px] text-white/35">{fmtDate(r.createdAt)}</div>
                  </div>
                  <Stars rating={r.rating} size={13} />
                </div>
                <p className="mt-2 text-sm leading-relaxed text-white/55">{r.comment}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.summary.count > withWords.length && (
        <p className="text-center text-[11px] text-white/30">
          {t("barberApp.starsOnly").replace("{count}", String(data.summary.count - withWords.length))}
        </p>
      )}
    </div>
  );
}
