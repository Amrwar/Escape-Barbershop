"use client";

import { useTranslation } from "@/lib/i18n";

/**
 * The punch card.
 *
 * It has to answer one question from across a room: how many more? So a stamp
 * that has been earned and one that has not must look nothing alike — a filled
 * disc of brass carrying a pair of scissors, against a hollow dashed ring on a
 * sunken ground. The first version drew empty stamps in the card's own colour,
 * which made them invisible and the card meaningless.
 *
 * When a reward is waiting the card says so first and loudest, because that is
 * the only moment it asks the customer to do anything.
 */

export interface Loyalty {
  stamps: number;
  toNext: number;
  available: number;
  visitsRequired: number;
  rewardText: string;
  rewardTextAr: string | null;
}

/** The mark inside a stamp that has been earned. */
function Scissors() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <circle cx="6" cy="6" r="2.6" />
      <circle cx="6" cy="18" r="2.6" />
      <path d="M8.2 7.8L20 18M8.2 16.2L20 6" strokeLinecap="round" />
    </svg>
  );
}

export function LoyaltyCard({ loyalty }: { loyalty: Loyalty }) {
  const { t, lang } = useTranslation();
  const reward = (lang === "ar" && loyalty.rewardTextAr) || loyalty.rewardText;
  const ready = loyalty.available > 0;

  // A full card reads as full, rather than as an empty one starting again.
  const filled = ready ? loyalty.visitsRequired : loyalty.stamps;

  return (
    <div className={`c-card-raised animate-fade-up overflow-hidden ${ready ? "shadow-glow" : ""}`}>
      <div className="flex items-start justify-between gap-4 p-5 pb-4">
        <div className="min-w-0">
          <div className={`text-sm font-semibold ${ready ? "text-accent" : "text-ink"}`}>
            {ready ? t("app.rewardReady") : t("app.loyaltyTitle")}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-mid">
            {ready
              ? t("app.rewardReadyHint").replace("{reward}", reward)
              : t("app.loyaltyHint").replace("{count}", String(loyalty.toNext)).replace("{reward}", reward)}
          </p>
        </div>

        <div className="shrink-0 text-end">
          <div className="c-display text-3xl leading-none text-ink">
            {filled}
            <span className="text-soft">/{loyalty.visitsRequired}</span>
          </div>
        </div>
      </div>

      {/* The stamps sit on a sunken strip, so a hollow one is still a shape. */}
      <div className="border-t border-hair bg-app px-5 py-4">
        <div className="flex flex-wrap gap-2.5">
          {Array.from({ length: loyalty.visitsRequired }, (_, i) => {
            const earned = i < filled;
            return (
              <span
                key={i}
                aria-label={earned ? t("app.stampEarned") : t("app.stampEmpty")}
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors ${
                  earned
                    ? "border-accent bg-accent text-accent-ink"
                    : "border-dashed border-faint bg-surface text-soft"
                }`}
              >
                {earned ? <Scissors /> : <span className="text-[11px] tabular-nums">{i + 1}</span>}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
