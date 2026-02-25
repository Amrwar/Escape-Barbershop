import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { Providers } from "./providers";
import type { Language } from "@/lib/i18n";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Escape Barbershop",
  description: "Manage your barbershop — visits, customers, salaries and more",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Escape",
  },
  formatDetection: { telephone: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = cookies();
  const rawLang = cookieStore.get("lang")?.value;
  const lang: Language = rawLang === "ar" ? "ar" : "en";
  const dir = lang === "ar" ? "rtl" : "ltr";

  return (
    <html lang={lang} dir={dir} className={cairo.variable}>
      <head>
        <meta name="theme-color" content="#9333ea" />
        <link rel="apple-touch-icon" href="/logo.jpg" />
      </head>
      <body className="bg-gray-50 text-gray-900 antialiased">
        <Providers initialLang={lang}>{children}</Providers>
      </body>
    </html>
  );
}
