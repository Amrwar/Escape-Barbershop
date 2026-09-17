"use client";

import { useState } from "react";
import { useTranslation } from "@/lib/i18n";

/**
 * "Tell a friend": their code, big enough to read out, and one button that
 * shares it however their phone likes to share things.
 *
 * The count underneath is the honest one — friends who actually came in, not
 * friends who tapped a link.
 */

export interface Referral {
  code: string | null;
  rewardText: string;
  rewardTextAr: string | null;
  standing: { invited: number; earned: number; waiting: number; rewarded: number };
}

export function ReferralCard({ referral }: { referral: Referral }) {
  const { t, lang } = useTranslation();
  const [copied, setCopied] = useState(false);
  if (!referral.code) return null;

  const reward = (lang === "ar" && referral.rewardTextAr) || referral.rewardText;
  const share = async () => {
    const text = t("app.referralShare").replace("{code}", referral.code!).replace("{reward}", reward);
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // They closed the share sheet: nothing to report.
    }
  };

  return (
    <div className="c-card animate-fade-up p-5">
      <div className="text-sm font-medium text-white">{t("app.referralTitle")}</div>
      <p className="mt-1 text-sm text-white/55">{t("app.referralHint").replace("{reward}", reward)}</p>

      <div className="mt-4 rounded-xl border border-dashed border-brass-400/40 bg-brass-400/[0.06] py-4 text-center">
        <div className="text-2xl font-bold tracking-[0.3em] text-brass-200">{referral.code}</div>
      </div>

      <button type="button" onClick={share} className="c-btn-secondary mt-3 w-full">
        {copied ? t("app.referralCopied") : t("app.referralShareButton")}
      </button>

      {referral.standing.invited > 0 && (
        <p className="mt-3 text-center text-xs text-white/40">
          {t("app.referralCount")
            .replace("{invited}", String(referral.standing.invited))
            .replace("{earned}", String(referral.standing.earned))}
        </p>
      )}

      {referral.standing.waiting > 0 && (
        <p className="mt-2 text-center text-xs text-brass-300">{t("app.referralWaiting")}</p>
      )}
    </div>
  );
}
