"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { loginSchema } from "@/lib/validations";
import { useTranslation } from "@/lib/i18n";
import { landingFor } from "@/lib/nav";
import { LanguageToggle } from "@/components/ui/LanguageToggle";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ended, setEnded] = useState<string | null>(null);

  // Why the last session ended, when it was the timeout rather than the user.
  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("ended");
    if (reason === "idle" || reason === "max" || reason === "expired") setEnded(reason);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      setError(result.error.errors[0].message);
      return;
    }
    setLoading(true);
    try {
      const res = await signIn("credentials", { email, password, redirect: false });
      if (res?.error) {
        setError(t("auth.invalidCredentials"));
      } else {
        // Read the role back so each side opens on its own landing page.
        const session = await fetch("/api/auth/session").then((r) => r.json()).catch(() => null);
        router.push(landingFor(session?.user?.role));
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary-900 via-primary-950 to-black p-4">
      {/* Language toggle — top right (always) */}
      <div className="fixed top-4 end-4">
        <LanguageToggle />
      </div>

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Image
              src="/logo.jpg"
              alt="Escape Barbershop"
              width={120}
              height={120}
              className="rounded-2xl shadow-lg"
              priority
            />
          </div>
          <h1 className="text-white text-xl font-bold tracking-[0.22em] uppercase">Escape</h1>
          <p className="text-primary-300 mt-1 text-sm tracking-wide">{t("auth.loginSubtitle")}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {ended && !error && (
              <div className="bg-amber-50 text-amber-800 text-sm px-4 py-3 rounded-lg border border-amber-200">
                {t(ended === "idle" ? "auth.endedIdle" : ended === "max" ? "auth.endedMax" : "auth.endedExpired")}
              </div>
            )}

            <div>
              <label className="label" htmlFor="email">
                {t("auth.emailOrPhone")}
              </label>
              {/*
                Text, not email: the office signs in with an address and a
                barber with their phone number, and an email input refuses to
                submit the second one at all.
              */}
              <input
                id="email"
                type="text"
                autoComplete="username"
                required
                className="input"
                placeholder={t("auth.emailOrPhonePlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="label" htmlFor="password">
                {t("auth.password")}
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                className="input"
                placeholder={t("auth.passwordPlaceholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
              {loading ? t("auth.signingIn") : t("auth.signIn")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
