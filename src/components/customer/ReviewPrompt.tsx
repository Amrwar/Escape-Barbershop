"use client";

import { useState } from "react";
import { useTranslation } from "@/lib/i18n";
import { Avatar } from "./kit";
import { StarPicker, Stars } from "./Stars";

/**
 * "How was it?" — asked once, about one visit, and easy to ignore.
 *
 * The stars are the whole question; the box for words is optional and only
 * appears once they have picked, so the card stays a single tap for anyone who
 * has nothing to add.
 */

export interface Reviewable {
  appointmentId: string;
  startAt: string;
  barber: { id: string; name: string; photo: string | null } | null;
  services: string[];
  canReview: boolean;
  review: { rating: number; comment: string | null; createdAt: string } | null;
}

export function ReviewPrompt({ item, onSaved }: { item: Reviewable; onSaved: (rating: number, comment: string) => void }) {
  const { t, fmtDate } = useTranslation();
  const [rating, setRating] = useState(item.review?.rating ?? 0);
  const [comment, setComment] = useState(item.review?.comment ?? "");
  const [editing, setEditing] = useState(!item.review);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!rating) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/customer/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId: item.appointmentId, rating, comment }),
      });
      if (!res.ok) {
        setError(t("app.rateFailed"));
        return;
      }
      setEditing(false);
      onSaved(rating, comment);
    } catch {
      setError(t("app.rateFailed"));
    } finally {
      setSaving(false);
    }
  };

  const heading = item.barber ? t("app.rateWith").replace("{name}", item.barber.name) : t("app.rate");

  return (
    <div className="c-card animate-fade-up p-5">
      <div className="flex items-center gap-3">
        <Avatar name={item.barber?.name ?? "?"} photo={item.barber?.photo} size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-ink">{heading}</div>
          <div className="truncate text-xs text-soft">
            {fmtDate(item.startAt)} · {item.services.join(" + ")}
          </div>
        </div>
      </div>

      {!editing && item.review ? (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-hair pt-4">
          <div className="min-w-0">
            <Stars rating={rating} size={18} />
            {comment && <p className="mt-2 text-sm text-mid">{comment}</p>}
            <p className="mt-1 text-xs text-good">{t("app.rateThanks")}</p>
          </div>
          {item.canReview && (
            <button type="button" onClick={() => setEditing(true)} className="c-btn-ghost shrink-0 text-xs">
              {t("app.rateChange")}
            </button>
          )}
        </div>
      ) : (
        <div className="mt-4 border-t border-hair pt-4">
          <div className="flex justify-center">
            <StarPicker value={rating} onChange={setRating} disabled={saving} />
          </div>

          {rating > 0 && (
            <div className="mt-4 animate-fade-up space-y-3">
              <textarea
                className="c-input min-h-[76px] resize-none"
                placeholder={t("app.rateComment")}
                maxLength={500}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <button type="button" onClick={save} disabled={saving} className="c-btn-primary w-full">
                {saving ? "…" : t("app.rateSend")}
              </button>
            </div>
          )}

          {error && <p className="mt-3 text-center text-xs text-bad">{error}</p>}
        </div>
      )}
    </div>
  );
}
