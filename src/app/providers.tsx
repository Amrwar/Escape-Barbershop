"use client";

import { SessionProvider } from "next-auth/react";
import { LanguageProvider, type Language } from "@/lib/i18n";
import { SessionTimeout } from "@/components/layout/SessionTimeout";

export function Providers({
  children,
  initialLang,
}: {
  children: React.ReactNode;
  initialLang: Language;
}) {
  return (
    <SessionProvider>
      <SessionTimeout />
      <LanguageProvider initialLang={initialLang}>{children}</LanguageProvider>
    </SessionProvider>
  );
}
