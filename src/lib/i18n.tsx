"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import en, { TranslationKey } from "../../messages/en";
import ar from "../../messages/ar";

export type Language = "en" | "ar";

const dictionaries = { en, ar } as const;

interface I18nContextValue {
  lang: Language;
  dir: "ltr" | "rtl";
  setLang: (lang: Language) => void;
  t: (key: TranslationKey) => string;
  fmtNumber: (n: number) => string;
  fmtCurrency: (n: number) => string;
  fmtDate: (date: Date | string) => string;
  fmtDateTime: (date: Date | string) => string;
  fmtTime: (date: Date | string) => string;
  fmtCustomerName: (name: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const COOKIE_NAME = "lang";
const STORAGE_KEY = "lang";

function saveLang(lang: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {}
  document.cookie = `${COOKIE_NAME}=${lang};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
}

function detectClientLang(initial: Language): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "ar" || stored === "en") return stored;
    const cookie = document.cookie.match(/(?:^|;\s*)lang=([^;]*)/);
    if (cookie) {
      const v = cookie[1];
      if (v === "ar" || v === "en") return v;
    }
    const browser = navigator.language.toLowerCase();
    if (browser.startsWith("ar")) return "ar";
  } catch {}
  return initial;
}

export function LanguageProvider({
  initialLang,
  children,
}: {
  initialLang: Language;
  children: React.ReactNode;
}) {
  const [lang, setLangState] = useState<Language>(initialLang);

  // Reconcile on first client render
  useEffect(() => {
    const detected = detectClientLang(initialLang);
    if (detected !== lang) setLangState(detected);
    // Ensure HTML attrs match on hydration
    document.documentElement.lang = detected;
    document.documentElement.dir = detected === "ar" ? "rtl" : "ltr";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync HTML attrs on every lang change
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = useCallback((newLang: Language) => {
    saveLang(newLang);
    setLangState(newLang);
  }, []);

  const dir = lang === "ar" ? "rtl" : "ltr";

  const t = useCallback(
    (key: TranslationKey): string =>
      (dictionaries[lang][key] as string) ??
      (dictionaries.en[key] as string) ??
      key,
    [lang]
  );

  // Arabic: Western digits, Arabic locale conventions
  const arLocale = "ar-u-nu-latn";

  const fmtNumber = useCallback(
    (n: number): string =>
      new Intl.NumberFormat(lang === "ar" ? arLocale : "en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n),
    [lang]
  );

  const fmtCurrency = fmtNumber;

  const fmtDate = useCallback(
    (date: Date | string): string => {
      const d = typeof date === "string" ? new Date(date) : date;
      return new Intl.DateTimeFormat(lang === "ar" ? arLocale : "en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(d);
    },
    [lang]
  );

  const fmtDateTime = useCallback(
    (date: Date | string): string => {
      const d = typeof date === "string" ? new Date(date) : date;
      return new Intl.DateTimeFormat(lang === "ar" ? arLocale : "en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: lang === "en",
      }).format(d);
    },
    [lang]
  );

  // Always pass an explicit locale: bare toLocaleTimeString() resolves to the
  // runtime default, which differs between the Node server and the browser and
  // breaks hydration.
  const fmtTime = useCallback(
    (date: Date | string): string => {
      const d = typeof date === "string" ? new Date(date) : date;
      return new Intl.DateTimeFormat(lang === "ar" ? arLocale : "en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: lang === "en",
      }).format(d);
    },
    [lang]
  );

  const fmtCustomerName = useCallback(
    (name: string): string =>
      name === "Walk-in" ? t("common.walkInName") : name,
    [t]
  );

  return (
    <I18nContext.Provider
      value={{ lang, dir, setLang, t, fmtNumber, fmtCurrency, fmtDate, fmtDateTime, fmtTime, fmtCustomerName }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useTranslation must be inside LanguageProvider");
  return ctx;
}
