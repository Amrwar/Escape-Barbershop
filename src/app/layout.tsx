import type { Metadata } from "next";
import { Bodoni_Moda, Cairo, Manrope } from "next/font/google";
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

/** The apps read in Manrope and count in Bodoni. The till screens use neither. */
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  variable: "--font-bodoni",
  display: "swap",
  weight: ["400", "600", "700"],
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
    <html lang={lang} dir={dir} className={`${cairo.variable} ${manrope.variable} ${bodoni.variable}`}>
      <head>
        <meta name="theme-color" content="#0b0a09" />
        {/* Settle the app's theme before the first paint, so nobody sees the
            wrong one flash past. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('escape-app-theme');if(t==='light'||t==='dark')document.documentElement.dataset.appTheme=t;}catch(e){}",
          }}
        />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="bg-gray-50 text-gray-900 antialiased">
        <Providers initialLang={lang}>{children}</Providers>
      </body>
    </html>
  );
}
