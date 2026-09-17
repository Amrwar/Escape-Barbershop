"use client";

import { useRef, useState } from "react";
import { useTranslation } from "@/lib/i18n";
import { Avatar } from "./kit";

/**
 * A customer's own picture.
 *
 * A phone camera produces four megabytes; the shop has no use for that and the
 * database certainly does not. The picture is squared off and shrunk to 512
 * pixels here, on the phone, before anything is sent — which also means the
 * upload works on a bad connection outside the shop.
 */

const MAX_SIDE = 512;

async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = MAX_SIDE;
  canvas.height = MAX_SIDE;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("no canvas");

  // Square from the middle, which is where a face usually is.
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    MAX_SIDE,
    MAX_SIDE
  );
  bitmap.close?.();

  return canvas.toDataURL("image/jpeg", 0.82);
}

export function PhotoPicker({
  name,
  photo,
  onChange,
}: {
  name: string;
  photo: string | null;
  onChange: (photo: string | null) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const choose = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(t("app.photoNotImage"));
      return;
    }

    setBusy(true);
    setError("");
    try {
      await onChange(await shrink(file));
    } catch {
      setError(t("app.photoFailed"));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className="relative shrink-0 rounded-full transition-opacity disabled:opacity-50"
        aria-label={t("app.photoChange")}
      >
        <Avatar name={name} photo={photo} size={64} />
        <span className="absolute -bottom-0.5 -end-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-hair bg-surface text-[11px] text-accent">
          {busy ? "…" : "+"}
        </span>
      </button>

      <div className="min-w-0">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => input.current?.click()} disabled={busy} className="c-btn-ghost text-[10px]">
            {photo ? t("app.photoChange") : t("app.photoAdd")}
          </button>
          {photo && (
            <button type="button" onClick={() => onChange(null)} disabled={busy} className="c-btn-ghost text-[10px]">
              {t("app.photoRemove")}
            </button>
          )}
        </div>
        <p className="mt-1 text-[11px] text-faint">{error || t("app.photoHint")}</p>
      </div>

      <input
        ref={input}
        id="customer-photo"
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => choose(e.target.files?.[0])}
      />
    </div>
  );
}
