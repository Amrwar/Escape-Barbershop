"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "@/lib/i18n";
import { EmptyState, ScreenTitle, Skeleton } from "@/components/customer/kit";

/**
 * A barber's own portfolio.
 *
 * Customers pick a barber by their work far sooner than by their name, so this
 * is the most valuable screen a barber has. Photos are squared and shrunk on
 * the phone before they are sent — a camera produces four megabytes, and this
 * is being done standing in a shop on whatever signal there is.
 */

interface Photo {
  id: string;
  image: string;
  caption: string | null;
}

const MAX_SIDE = 900;

async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = MAX_SIDE;
  canvas.height = MAX_SIDE;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("no canvas");

  // Squared from the middle, which is how the grid shows it anyway.
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, MAX_SIDE, MAX_SIDE);
  bitmap.close?.();

  return canvas.toDataURL("image/jpeg", 0.78);
}

export default function BarberPortfolioPage() {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    fetch("/api/barber/photos")
      .then((r) => r.json())
      .then((d) => setPhotos(Array.isArray(d) ? d : []))
      .catch(() => setPhotos([]));
  }, []);

  useEffect(load, [load]);

  const add = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(t("app.photoNotImage"));
      return;
    }

    setBusy(true);
    setError("");
    try {
      const image = await shrink(file);
      const res = await fetch("/api/barber/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
      });
      if (!res.ok) setError((await res.json())?.error ?? t("app.photoFailed"));
      load();
    } catch {
      setError(t("app.photoFailed"));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await fetch(`/api/barber/photos?id=${id}`, { method: "DELETE" });
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 pt-2">
      <ScreenTitle title={t("portfolio.title")} hint={t("portfolio.hint")} />

      <button type="button" onClick={() => input.current?.click()} disabled={busy} className="c-btn-primary w-full">
        {busy ? "…" : t("portfolio.add")}
      </button>
      <input
        ref={input}
        id="portfolio-photo"
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => add(e.target.files?.[0])}
      />

      {error && <p className="text-center text-xs text-bad">{error}</p>}

      {photos === null ? (
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="aspect-square" />
          ))}
        </div>
      ) : photos.length === 0 ? (
        <EmptyState icon="scissors" title={t("portfolio.none")} hint={t("portfolio.noneHint")} />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {photos.map((photo) => (
            <div key={photo.id} className="relative overflow-hidden border border-hair">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.image} alt={photo.caption ?? ""} className="aspect-square w-full object-cover" />
              <button
                type="button"
                onClick={() => remove(photo.id)}
                disabled={busy}
                aria-label={t("app.photoRemove")}
                className="absolute end-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border border-hair bg-app text-sm text-ink"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-center text-[11px] text-faint">{t("portfolio.limit")}</p>
    </div>
  );
}
