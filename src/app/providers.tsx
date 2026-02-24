"use client";

import { SessionProvider } from "next-auth/react";
import { LanguageProvider, type Language } from "@/lib/i18n";

export function Providers({
  children,
  initialLang,
}: {
  children: React.ReactNode;
  initialLang: Language;
}) {
  return (
    <SessionProvider>
      <LanguageProvider initialLang={initialLang}>{children}</LanguageProvider>
    </SessionProvider>
  );
}
