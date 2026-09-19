"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n";
import { Avatar, EmptyState, ScreenTitle, Skeleton } from "@/components/customer/kit";
import { Stars } from "@/components/customer/Stars";

/**
 * Every haircut the shop has a record of, which for a regular here is years of
 * them. Newest first, and loaded a page at a time — some of these customers
 * have been coming since long before any of this existed.
 */

interface Visit {
  id: string;
  visitAt: string;
  total: number;
  barber: { id: string; name: string; photo: string | null } | null;
  rating: number | null;
  services: { name: string | null; arabicName: string | null; quantity: number; price: number }[];
  products: { name: string; quantity: number }[];
}

export default function HistoryPage() {
  const { t, lang, fmtCurrency, fmtDate } = useTranslation();
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (before?: string) => {
    const res = await fetch(`/api/customer/visits${before ? `?before=${encodeURIComponent(before)}` : ""}`);
    const data = await res.json();
    if (!Array.isArray(data?.visits)) return;

    setVisits((current) => (before && current ? [...current, ...data.visits] : data.visits));
    setNextBefore(data.nextBefore ?? null);
  }, []);

  useEffect(() => {
    load().catch(() => setVisits([]));
  }, [load]);

  const more = async () => {
    if (!nextBefore) return;
    setLoadingMore(true);
    try {
      await load(nextBefore);
    } finally {
      setLoadingMore(false);
    }
  };

  const serviceName = (s: Visit["services"][number]) =>
    (lang === "ar" && s.arabicName ? s.arabicName : s.name) ?? "—";

  return (
    <div className="space-y-6">
      <ScreenTitle title={t("history.title")} hint={t("history.hint")} />

      {visits === null ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : visits.length === 0 ? (
        <EmptyState icon="scissors" title={t("history.none")} hint={t("history.noneHint")} />
      ) : (
        <>
          <div className="space-y-2">
            {visits.map((visit) => (
              <Link key={visit.id} href={`/app/history/${visit.id}`} className="c-card block p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="c-display text-lg leading-none">{fmtDate(visit.visitAt)}</div>
                    <p className="mt-2 text-sm text-mid">
                      {visit.services.map((s) => `${serviceName(s)}${s.quantity > 1 ? ` ×${s.quantity}` : ""}`).join(" + ")}
                    </p>
                    {visit.products.length > 0 && (
                      <p className="mt-1 text-xs text-soft">
                        {visit.products.map((p) => `${p.name}${p.quantity > 1 ? ` ×${p.quantity}` : ""}`).join(", ")}
                      </p>
                    )}
                    {visit.rating !== null && (
                      <div className="mt-2">
                        <Stars rating={visit.rating} />
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 text-end">
                    <div className="c-display text-lg leading-none text-accent">{fmtCurrency(visit.total)}</div>
                    {visit.barber && (
                      <div className="mt-2 flex items-center justify-end gap-2">
                        <span className="text-xs text-soft">{visit.barber.name}</span>
                        <Avatar name={visit.barber.name} photo={visit.barber.photo} size={24} />
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {nextBefore && (
            <button type="button" onClick={more} disabled={loadingMore} className="c-btn-secondary w-full">
              {loadingMore ? "…" : t("history.more")}
            </button>
          )}
        </>
      )}
    </div>
  );
}
