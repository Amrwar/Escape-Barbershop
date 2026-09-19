"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import { Avatar, EmptyState, Pill, ScreenTitle, Skeleton } from "@/components/customer/kit";
import { RatingLine, Stars } from "@/components/customer/Stars";

interface Service {
  id: string;
  name: string;
  arabicName: string | null;
  defaultPrice: number;
  durationMinutes: number;
}

interface Barber {
  id: string;
  name: string;
  bio: string | null;
  photo: string | null;
  serviceIds: string[];
  rating: { average: number | null; count: number };
}

interface Photo {
  id: string;
  image: string;
  caption: string | null;
}

interface Review {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  name: string;
}

/** One barber: who they are, what they do, and a way to book them. */
export default function BarberProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { t, fmtCurrency, fmtDate, lang } = useTranslation();
  const [data, setData] = useState<{ barber: Barber | null; services: Service[] } | null>(null);
  const [reviews, setReviews] = useState<{
    summary: { average: number | null; count: number };
    reviews: Review[];
    photos?: Photo[];
  } | null>(null);

  useEffect(() => {
    fetch("/api/customer/catalog")
      .then((r) => r.json())
      .then((d) => {
        const barber = (d?.barbers ?? []).find((b: Barber) => b.id === id) ?? null;
        setData({ barber, services: d?.services ?? [] });
      })
      .catch(() => setData({ barber: null, services: [] }));

    fetch(`/api/customer/barbers/${id}/reviews`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setReviews)
      .catch(() => setReviews(null));
  }, [id]);

  if (!data) {
    return (
      <div className="space-y-3 pt-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (!data.barber) {
    return (
      <div className="pt-6">
        <EmptyState icon="users" title={t("app.barberNotFound")} />
      </div>
    );
  }

  const barber = data.barber;
  // An empty list means this barber does everything.
  const theirs = barber.serviceIds.length === 0 ? data.services : data.services.filter((s) => barber.serviceIds.includes(s.id));

  return (
    <div className="space-y-6 pt-2">
      <Link href="/app/barbers" className="inline-flex items-center gap-1 text-sm text-soft transition-colors hover:text-mid">
        ‹ {t("app.ourBarbers")}
      </Link>

      <section className="c-card-raised animate-fade-up overflow-hidden">
        <div className="c-photo-slot h-40 w-full">
          {barber.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={barber.photo} alt={barber.name} className="h-full w-full object-cover" />
          ) : (
            <Avatar name={barber.name} size={72} />
          )}
        </div>
        <div className="p-5">
          <ScreenTitle title={barber.name} hint={barber.bio ?? undefined} />
          {reviews && reviews.summary.count > 0 && (
            <div className="mt-3">
              <RatingLine rating={reviews.summary} size={16} />
            </div>
          )}
          <Link href="/app/book" className="c-btn-primary mt-4 w-full">
            {t("app.bookWith").replace("{name}", barber.name)}
          </Link>
        </div>
      </section>

      {reviews && (reviews.photos?.length ?? 0) > 0 && (
        <section>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">{t("portfolio.their")}</h2>
          <div className="scroll-clean -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
            {reviews.photos!.map((photo) => (
              <div key={photo.id} className="w-44 shrink-0 overflow-hidden border border-hair">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.image} alt={photo.caption ?? ""} className="aspect-square w-full object-cover" />
              </div>
            ))}
          </div>
        </section>
      )}

      {reviews && reviews.reviews.length > 0 && (
        <section>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-soft">{t("app.reviews")}</h2>
          <div className="space-y-2">
            {/*
              What they said leads; who said it and when sits under it, quietly.
              The other way round reads like a table of contacts rather than an
              opinion somebody took the trouble to write.
            */}
            {reviews.reviews.map((r) => (
              <figure key={r.id} className="c-card p-4">
                <Stars rating={r.rating} size={13} />
                <blockquote className="mt-2.5 text-sm leading-relaxed text-ink">{r.comment}</blockquote>
                <figcaption className="mt-2.5 text-xs text-faint">
                  {r.name}
                  <span className="mx-1.5">·</span>
                  {fmtDate(r.createdAt)}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {theirs.length > 0 && (
        <section>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-soft">{t("app.whatTheyDo")}</h2>
          <div className="c-card divide-y divide-hair">
            {theirs.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm text-ink">{lang === "ar" && s.arabicName ? s.arabicName : s.name}</div>
                  <div className="mt-0.5 text-[11px] text-faint">
                    {s.durationMinutes} {t("appointments.minutesShort")}
                  </div>
                </div>
                <Pill tone="brass">{fmtCurrency(s.defaultPrice)}</Pill>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
