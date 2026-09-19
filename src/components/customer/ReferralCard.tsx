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

  /**
   * A link, not a bare code. The friend had to read six characters off a
   * message and retype them into a form they also had to find; now the link
   * opens sign-up with the code already in it.
   */
  const invite = () => {
    const link = `${window.location.origin}/app/login?join=1&ref=${encodeURIComponent(referral.code!)}`;
    const text = t("app.referralShare").replace("{code}", referral.code!).replace("{reward}", reward);
    return { link, text: `${text}\n${link}` };
  };

  const share = async () => {
    const { text } = invite();
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

  // WhatsApp explicitly, because that is how this shop's customers send things
  // and because the OS share sheet does not exist on a desktop browser.
  const whatsapp = () => {
    const { text } = invite();
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };

  return (
    <div className="c-card animate-fade-up p-5">
      <div className="text-sm font-medium text-ink">{t("app.referralTitle")}</div>
      <p className="mt-1 text-sm text-mid">{t("app.referralHint").replace("{reward}", reward)}</p>

      <div className="mt-4 rounded-[3px] border border-dashed border-accent bg-accent-soft py-4 text-center">
        <div className="text-2xl font-bold tracking-[0.3em] text-accent">{referral.code}</div>
      </div>

      <div className="mt-3 flex gap-2">
        <button type="button" onClick={whatsapp} className="c-btn-primary flex-1">
          {t("app.referralWhatsApp")}
        </button>
        <button type="button" onClick={share} className="c-btn-secondary flex-1">
          {copied ? t("app.referralCopied") : t("app.referralShareButton")}
        </button>
      </div>

      {referral.standing.invited > 0 && (
        <p className="mt-3 text-center text-xs text-soft">
          {t("app.referralCount")
            .replace("{invited}", String(referral.standing.invited))
            .replace("{earned}", String(referral.standing.earned))}
        </p>
      )}

      {referral.standing.waiting > 0 && (
        <p className="mt-2 text-center text-xs text-accent">{t("app.referralWaiting")}</p>
      )}
    </div>
  );
}
