"use client";

import { useTranslation } from "@/lib/i18n";

/**
 * English or Arabic, in two taps' worth of space.
 *
 * This sits on both sides of the app — the till's white chrome and the Brass &
 * Ink shells of the customer and barber apps — so it takes the skin as a prop
 * rather than assuming one. It assumed the till's, which put a white pill on
 * the app's dark ground and, in the light theme, white on cream.
 */
const SKIN = {
  shop: {
    track: "bg-gray-100",
    on: "bg-white text-gray-900 shadow-sm",
    off: "text-gray-400 hover:text-gray-600",
  },
  app: {
    track: "bg-raised",
    on: "bg-accent text-accent-ink",
    off: "text-soft hover:text-ink",
  },
} as const;

export function LanguageToggle({ tone = "shop" }: { tone?: keyof typeof SKIN }) {
  const { lang, setLang } = useTranslation();
  const skin = SKIN[tone];

  const button = (code: "en" | "ar", label: string) => (
    <button
      type="button"
      onClick={() => setLang(code)}
      aria-pressed={lang === code}
      className={`rounded-md px-2.5 py-1 text-xs font-bold tracking-wide transition-all ${
        lang === code ? skin.on : skin.off
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className={`flex shrink-0 items-center gap-0.5 rounded-lg p-1 ${skin.track}`}>
      {button("en", "EN")}
      {button("ar", "AR")}
    </div>
  );
}
