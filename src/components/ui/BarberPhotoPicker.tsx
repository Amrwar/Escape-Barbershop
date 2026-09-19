"use client";

import { useRef, useState } from "react";
import { useTranslation } from "@/lib/i18n";

/**
 * A barber's face, for the customer app.
 *
 * `photo` has been on the barber record and read by the customer app, the
 * booking flow and the roster since each was built — with nothing anywhere to
 * set one, so every barber has shown as initials in a grey circle.
 *
 * Squared and shrunk to 512 here before it is sent, like every other picture in
 * this system. It rides along with the public catalogue that every customer
 * loads, so a four-megabyte camera original would be paid for on every visit to
 * the app.
 */

const SIDE = 512;

async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);

  const canvas = document.createElement("canvas");
  canvas.width = SIDE;
  canvas.height = SIDE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no canvas");

  // Centre crop, so a portrait and a landscape both end up as a face.
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIDE, SIDE);
  bitmap.close?.();

  return canvas.toDataURL("image/jpeg", 0.8);
}

export function BarberPhotoPicker({
  name,
  photo,
  onChange,
}: {
  name: string;
  photo: string | null;
  onChange: (photo: string | null) => void;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(t("barbers.photoNotImage"));
      return;
    }

    setBusy(true);
    setError("");
    try {
      onChange(await shrink(file));
    } catch {
      setError(t("barbers.photoFailed"));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div>
      <label className="label">{t("barbers.photo")}</label>

      <div className="flex items-center gap-4">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border border-gray-200 bg-gray-50">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt={name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-gray-400">
              {name.trim()[0]?.toUpperCase() ?? "?"}
            </div>
          )}
        </div>

        <div className="flex-1 space-y-2">
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="btn-secondary w-full text-sm"
          >
            {busy ? "…" : photo ? t("barbers.photoReplace") : t("barbers.photoAdd")}
          </button>
          {photo && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="w-full text-xs text-gray-500 hover:text-gray-700"
            >
              {t("barbers.photoRemove")}
            </button>
          )}
        </div>
      </div>

      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <p className="mt-2 text-xs text-gray-500">{t("barbers.photoHint")}</p>
    </div>
  );
}
