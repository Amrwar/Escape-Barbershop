"use client";

import { useTranslation } from "@/lib/i18n";

export function LanguageToggle() {
  const { lang, setLang } = useTranslation();

  return (
    <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-1 shrink-0">
      <button
        onClick={() => setLang("en")}
        className={`px-2.5 py-1 rounded-md text-xs font-bold tracking-wide transition-all ${
          lang === "en"
            ? "bg-white text-gray-900 shadow-sm"
            : "text-gray-400 hover:text-gray-600"
        }`}
      >
        EN
      </button>
      <button
        onClick={() => setLang("ar")}
        className={`px-2.5 py-1 rounded-md text-xs font-bold tracking-wide transition-all ${
          lang === "ar"
            ? "bg-white text-gray-900 shadow-sm"
            : "text-gray-400 hover:text-gray-600"
        }`}
      >
        AR
      </button>
    </div>
  );
}
