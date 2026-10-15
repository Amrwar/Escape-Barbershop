import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getLocales } from "expo-localization";
import * as SecureStore from "expo-secure-store";
import en, { type TranslationKey } from "../../../messages/en";
import ar from "../../../messages/ar";

/**
 * English and Arabic, from the very same dictionaries the web app uses, so a
 * word changed for the website changes here too. Formatting matches the web
 * app's: Western digits in Arabic, two decimals on money.
 */

export type Language = "en" | "ar";
export type { TranslationKey };

const dictionaries = { en, ar } as const;
const KEY = "lang";

// Arabic with Western digits, the way the shop writes prices.
const AR_LOCALE = "ar-u-nu-latn";

interface I18nValue {
  lang: Language;
  rtl: boolean;
  setLang: (lang: Language) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  fmtCurrency: (n: number) => string;
  fmtDate: (date: Date | string) => string;
  fmtTime: (date: Date | string) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function phoneLanguage(): Language {
  return getLocales()[0]?.languageCode === "ar" ? "ar" : "en";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>(phoneLanguage);

  useEffect(() => {
    SecureStore.getItemAsync(KEY)
      .then((v) => {
        if (v === "en" || v === "ar") setLangState(v);
      })
      .catch(() => undefined);
  }, []);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    SecureStore.setItemAsync(KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo<I18nValue>(() => {
    const locale = lang === "ar" ? AR_LOCALE : "en-US";
    const money = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
    const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", hour12: lang === "en" });
    const asDate = (d: Date | string) => (typeof d === "string" ? new Date(d) : d);

    return {
      lang,
      rtl: lang === "ar",
      setLang,
      t: (key, vars) => {
        let text = (dictionaries[lang][key] as string | undefined) ?? (dictionaries.en[key] as string | undefined) ?? key;
        for (const [name, v] of Object.entries(vars ?? {})) text = text.replace(`{${name}}`, String(v));
        return text;
      },
      fmtCurrency: (n) => money.format(n),
      fmtDate: (d) => date.format(asDate(d)),
      fmtTime: (d) => time.format(asDate(d)),
    };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useTranslation must be inside LanguageProvider");
  return ctx;
}
