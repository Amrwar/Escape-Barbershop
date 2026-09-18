"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "@/lib/i18n";
import { EmptyState, SectionTitle, Skeleton } from "./kit";

/**
 * "The cut I want."
 *
 * A customer keeps a few pictures of what they are after, and the barber sees
 * them the moment that customer is in the chair — on their day screen, before
 * a word is exchanged. "Short on the sides" means five things to five people;
 * a photograph means one.
 *
 * Shrunk on the phone before it is sent, like every other picture here.
 */

interface Wanted {
  id: string;
  image: string;
  note: string | null;
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

  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, MAX_SIDE, MAX_SIDE);
  bitmap.close?.();

  return canvas.toDataURL("image/jpeg", 0.78);
}

export function CutsWanted() {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Wanted[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    fetch("/api/customer/cuts-wanted")
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
      const res = await fetch("/api/customer/cuts-wanted", {
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
      await fetch(`/api/customer/cuts-wanted?id=${id}`, { method: "DELETE" });
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <SectionTitle>{t("wanted.title")}</SectionTitle>

      <div className="c-card p-5">
        <p className="text-sm text-mid">{t("wanted.hint")}</p>

        <button type="button" onClick={() => input.current?.click()} disabled={busy} className="c-btn-secondary mt-4 w-full">
          {busy ? "…" : t("wanted.add")}
        </button>
        <input
          ref={input}
          id="cut-wanted"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => add(e.target.files?.[0])}
        />

        {error && <p className="mt-2 text-center text-xs text-bad">{error}</p>}

        {photos === null ? (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="aspect-square" />
            ))}
          </div>
        ) : photos.length === 0 ? (
          <div className="mt-2">
            <EmptyState icon="scissors" title={t("wanted.none")} hint={t("wanted.noneHint")} />
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {photos.map((photo) => (
              <div key={photo.id} className="relative overflow-hidden border border-hair">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.image} alt={photo.note ?? ""} className="aspect-square w-full object-cover" />
                <button
                  type="button"
                  onClick={() => remove(photo.id)}
                  disabled={busy}
                  aria-label={t("app.photoRemove")}
                  className="absolute end-1 top-1 flex h-7 w-7 items-center justify-center rounded-full border border-hair bg-app text-xs text-ink"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
