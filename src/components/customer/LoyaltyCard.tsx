"use client";

import { useTranslation } from "@/lib/i18n";

/**
 * The punch card. Stamps fill from the left, and when one is full the card says
 * so plainly — the customer still has to ask at the counter, because the till
 * decides what is charged, not the app.
 */

export interface Loyalty {
  stamps: number;
  toNext: number;
  available: number;
  visitsRequired: number;
  rewardText: string;
  rewardTextAr: string | null;
}

export function LoyaltyCard({ loyalty }: { loyalty: Loyalty }) {
  const { t, lang } = useTranslation();
  const reward = (lang === "ar" && loyalty.rewardTextAr) || loyalty.rewardText;
  const ready = loyalty.available > 0;

  return (
    <div className={`c-card animate-fade-up p-5 ${ready ? "border-accent shadow-glow" : ""}`}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm font-medium text-ink">{ready ? t("app.rewardReady") : t("app.loyaltyTitle")}</div>
        <div className="text-xs tabular-nums text-soft">
          {loyalty.stamps}/{loyalty.visitsRequired}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {Array.from({ length: loyalty.visitsRequired }, (_, i) => (
          <span
            key={i}
            className={`h-7 w-7 rounded-full border transition-colors ${
              i < loyalty.stamps
                ? "border-accent bg-accent"
                : "border-hair bg-surface"
            }`}
          />
        ))}
      </div>

      <p className="mt-4 text-sm text-mid">
        {ready
          ? t("app.rewardReadyHint").replace("{reward}", reward)
          : t("app.loyaltyHint").replace("{count}", String(loyalty.toNext)).replace("{reward}", reward)}
      </p>
    </div>
  );
}
