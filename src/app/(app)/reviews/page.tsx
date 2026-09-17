"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Note } from "@/components/ui/Note";
import { useTranslation } from "@/lib/i18n";
import { ratingSummary } from "@/lib/reviews";

/**
 * What customers said, for the shop.
 *
 * The owner may hide a review, and that is all: it stays in this list, greyed
 * out, and the activity log remembers who hid it. A shop that can delete its
 * criticism has a rating worth nothing, including to itself.
 */

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  hiddenAt: string | null;
  barber: { id: string; name: string } | null;
  customer: { id: string; name: string } | null;
  appointment: { id: string; startAt: string } | null;
}

/** Five stars as text, which reads well in a dense table. */
function starText(rating: number): string {
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}

export default function ReviewsPage() {
  const { t, fmtDate } = useTranslation();
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [barberId, setBarberId] = useState("");

  const load = useCallback(() => {
    fetch(`/api/reviews${barberId ? `?barberId=${barberId}` : ""}`)
      .then((r) => r.json())
      .then((d) => setReviews(Array.isArray(d?.reviews) ? d.reviews : []))
      .catch(() => setReviews([]));
  }, [barberId]);

  useEffect(load, [load]);

  const setHidden = async (review: Review, hidden: boolean) => {
    setBusyId(review.id);
    try {
      await fetch(`/api/reviews/${review.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden }),
      });
      load();
    } finally {
      setBusyId(null);
    }
  };

  const visible = (reviews ?? []).filter((r) => !r.hiddenAt);
  const summary = ratingSummary(visible);
  const barbers = Array.from(
    new Map((reviews ?? []).filter((r) => r.barber).map((r) => [r.barber!.id, r.barber!])).values()
  );

  return (
    <div>
      <PageHeader title={t("nav.reviews")} subtitle={t("reviews.subtitle")} />

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs text-gray-500">{t("reviews.average")}</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
            {summary.average?.toFixed(1) ?? "—"}
          </div>
          <div className="mt-0.5 text-xs text-amber-500">{summary.average ? starText(Math.round(summary.average)) : ""}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs text-gray-500">{t("reviews.count")}</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{summary.count}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs text-gray-500">{t("reviews.hidden")}</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
            {(reviews ?? []).length - visible.length}
          </div>
        </div>
      </div>

      {barbers.length > 1 && (
        <div className="mb-4">
          <select
            value={barberId}
            onChange={(e) => setBarberId(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">{t("reviews.allBarbers")}</option>
            {barbers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {reviews === null ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <EmptyState icon="★" title={t("reviews.none")} description={t("reviews.noneHint")} />
      ) : (
        <div className="space-y-2">
          {reviews.map((review) => (
            <div
              key={review.id}
              className={`rounded-xl border bg-white p-4 ${review.hiddenAt ? "border-gray-200 opacity-60" : "border-gray-200"}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-500">{starText(review.rating)}</span>
                    <span className="text-sm font-medium text-gray-900">{review.barber?.name ?? "—"}</span>
                    {review.hiddenAt && <Badge variant="gray">{t("reviews.hiddenBadge")}</Badge>}
                  </div>
                  {review.comment && <p className="mt-1.5 text-sm text-gray-700">{review.comment}</p>}
                  <div className="mt-1.5 text-xs text-gray-400">
                    {review.customer?.name ?? "—"} · {fmtDate(review.createdAt)}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busyId === review.id}
                  onClick={() => setHidden(review, !review.hiddenAt)}
                  className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {review.hiddenAt ? t("reviews.show") : t("reviews.hide")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5">
        <Note tone="info" title={t("reviews.noteTitle")}>
          {t("reviews.note")}
        </Note>
      </div>
    </div>
  );
}
