"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n";

/**
 * "Is it worth walking down now?"
 *
 * The one thing this card must never do is sound more certain than it is. When
 * the shop is running its queue, it says what is actually happening. When it is
 * not, it says what usually happens at this hour and calls it that. When there
 * is not enough history to say either, it does not appear at all.
 */

interface Busy {
  live: { inChair: number; waiting: number; waitMinutes: number } | null;
  typical: { level: "quiet" | "steady" | "busy"; perHour: number; relative: number; fromWeeks: number } | null;
  quieterAt: number[];
}

const DOT: Record<"quiet" | "steady" | "busy", string> = {
  quiet: "bg-good-soft text-good",
  steady: "bg-warn-soft text-warn",
  busy: "bg-bad-soft text-bad",
};

export function BusyCard() {
  const { t, lang } = useTranslation();
  const [busy, setBusy] = useState<Busy | null>(null);

  const load = useCallback(() => {
    fetch("/api/customer/busy")
      .then((r) => r.json())
      .then(setBusy)
      .catch(() => setBusy(null));
  }, []);

  useEffect(() => {
    load();
    // A live queue moves; a forecast does not. Refreshing on the minute is
    // cheap and keeps the live number from going stale in a pocket.
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  if (!busy || (!busy.live && !busy.typical)) return null;

  const hour = (h: number) =>
    new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-GB", { hour: "numeric", hour12: true }).format(
      new Date(2026, 0, 1, h)
    );

  // Live beats the forecast whenever the shop is running its queue.
  if (busy.live) {
    const { waiting, waitMinutes } = busy.live;
    return (
      <section className="c-card p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-faint">{t("busy.nowTitle")}</p>
        <p className="c-display mt-2 text-3xl leading-none">
          {waitMinutes === 0 ? t("busy.walkIn") : t("busy.aboutMinutes").replace("{n}", String(waitMinutes))}
        </p>
        <p className="mt-2 text-sm text-soft">
          {waiting === 0 ? t("busy.nobodyWaiting") : t("busy.peopleWaiting").replace("{n}", String(waiting))}
        </p>
      </section>
    );
  }

  const typical = busy.typical!;
  return (
    <section className="c-card p-5">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-faint">{t("busy.usuallyTitle")}</p>

      <div className="mt-2 flex items-center gap-3">
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${DOT[typical.level]}`}>
          {t(`busy.${typical.level}` as "busy.quiet")}
        </span>
        <span className="text-sm text-soft">{t("busy.atThisHour")}</span>
      </div>

      {busy.quieterAt.length > 0 && (
        <p className="mt-3 text-sm text-mid">
          {t("busy.quieterAround").replace("{time}", busy.quieterAt.slice(0, 2).map(hour).join(" / "))}
        </p>
      )}

      {/* Said plainly, so nobody reads a forecast as a live queue. */}
      <p className="mt-3 text-xs text-faint">
        {t("busy.basedOn").replace("{n}", String(typical.fromWeeks))}
      </p>
    </section>
  );
}
