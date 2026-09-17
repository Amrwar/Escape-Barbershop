"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import { Avatar } from "./kit";

/**
 * "The usual" — their own habit, offered back to them.
 *
 * A regular books the same barber, the same cut, at the same sort of hour. This
 * shows the three free times nearest that hour and books on one tap. It is
 * deliberately one tap and not none: a booking holds a chair, so it is always
 * the customer who makes it, never the app.
 */

export interface Usual {
  barber: { id: string; name: string; photo: string | null } | null;
  services: { id: string; name: string; arabicName: string | null; defaultPrice: number; durationMinutes: number }[];
  durationMinutes: number;
  price: number;
  times: string[];
}

export function UsualCard({ usual }: { usual: Usual }) {
  const router = useRouter();
  const { t, lang, fmtCurrency, fmtDate, fmtTime } = useTranslation();
  const [booking, setBooking] = useState<string | null>(null);
  const [error, setError] = useState("");

  if (usual.times.length === 0) return null;

  const serviceNames = usual.services
    .map((s) => (lang === "ar" && s.arabicName ? s.arabicName : s.name))
    .join(" + ");

  const book = async (startAt: string) => {
    setBooking(startAt);
    setError("");
    try {
      const res = await fetch("/api/customer/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startAt,
          barberId: usual.barber?.id ?? null,
          serviceIds: usual.services.map((s) => s.id),
        }),
      });

      if (res.ok) {
        router.push("/app/appointments?booked=1");
        router.refresh();
        return;
      }
      setError((await res.json())?.error ?? t("app.usualFailed"));
    } catch {
      setError(t("appointments.networkError"));
    } finally {
      setBooking(null);
    }
  };

  return (
    <div className="c-card animate-fade-up p-5">
      <div className="flex items-center gap-3">
        <Avatar name={usual.barber?.name ?? "?"} photo={usual.barber?.photo} size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-ink">{serviceNames}</div>
          <div className="truncate text-xs text-soft">
            {usual.barber ? usual.barber.name : t("appointments.anyBarber")} · {usual.durationMinutes}{" "}
            {t("appointments.minutesShort")}
          </div>
        </div>
        <div className="c-display shrink-0 text-lg tabular-nums text-accent">{fmtCurrency(usual.price)}</div>
      </div>

      <div className="mt-4 grid gap-2 border-t border-hair pt-4 sm:grid-cols-3">
        {usual.times.map((time) => (
          <button
            key={time}
            type="button"
            onClick={() => book(time)}
            disabled={booking !== null}
            className="c-choice px-3 py-2.5 text-center disabled:opacity-50"
          >
            <div className="c-display text-base tabular-nums text-ink">{fmtTime(time)}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-faint">
              {booking === time ? "…" : fmtDate(time)}
            </div>
          </button>
        ))}
      </div>

      {error && <p className="mt-3 text-center text-xs text-red-300">{error}</p>}
    </div>
  );
}
