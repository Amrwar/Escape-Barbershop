"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { customerRegisterSchema } from "@/lib/validations";
import { isValidPhone } from "@/lib/customers";

/**
 * The way in. The phone number is the username, because everyone knows theirs
 * and nobody remembers which email they used at a barbershop.
 */
function CustomerLoginInner() {
  const router = useRouter();
  const { t } = useTranslation();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  // A friend's code, if somebody sent them. Never required.
  const [referralCode, setReferralCode] = useState("");
  const [error, setError] = useState("");
  const [ended, setEnded] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setEnded(new URLSearchParams(window.location.search).has("ended"));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!isValidPhone(phone)) {
      setError(t("app.badPhone"));
      return;
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        const parsed = customerRegisterSchema.safeParse({ name, phone, password, referralCode });
        if (!parsed.success) {
          setError(parsed.error.errors[0].message);
          return;
        }
        const res = await fetch("/api/customer/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        });
        if (!res.ok) {
          setError((await res.json()).error ?? t("app.signupFailed"));
          return;
        }
      }

      const res = await signIn("credentials", { email: phone, password, redirect: false });
      if (res?.error) {
        setError(t("app.wrongLogin"));
        return;
      }
      router.push("/app");
      router.refresh();
    } catch {
      setError(t("appointments.networkError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col justify-center overflow-hidden bg-primary-950 px-5 py-10 text-white">
      {/* Two soft lights in an otherwise black room */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(70%_100%_at_50%_0%,rgba(207,162,67,0.18),transparent_70%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-[radial-gradient(70%_100%_at_50%_100%,rgba(255,255,255,0.05),transparent_70%)]" />

      <div className="fixed end-5 top-5 z-10">
        <LanguageToggle />
      </div>

      <div className="relative mx-auto w-full max-w-sm">
        <div className="mb-8 text-center">
          <Image
            src="/logo.jpg"
            alt="Escape Barbershop"
            width={96}
            height={96}
            priority
            className="mx-auto rounded-2xl ring-1 ring-white/15"
          />
          <h1 className="mt-5 text-2xl font-bold uppercase tracking-[0.3em]">Escape</h1>
          <p className="mt-1.5 text-sm text-brass-300/80">{t("app.loginSubtitle")}</p>
        </div>

        <div className="c-card-raised p-6">
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError("");
                }}
                className={`rounded-lg py-2 text-sm font-medium transition-colors ${
                  mode === m ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"
                }`}
              >
                {t(m === "signin" ? "app.signIn" : "app.createAccount")}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <div className="animate-fade-up">
                <label className="c-label" htmlFor="name">
                  {t("field.name")}
                </label>
                <input id="name" className="c-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
              </div>
            )}

            <div>
              <label className="c-label" htmlFor="phone">
                {t("field.phone")}
              </label>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                className="c-input tracking-wide"
                placeholder="01X XXXX XXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                required
              />
            </div>

            <div>
              <label className="c-label" htmlFor="password">
                {t("auth.password")}
              </label>
              <input
                id="password"
                type="password"
                className="c-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                required
              />
            </div>

            {mode === "signup" && (
              <div className="animate-fade-up">
                <label className="c-label" htmlFor="referral">
                  {t("app.referralCodeField")}
                </label>
                <input
                  id="referral"
                  className="c-input uppercase tracking-[0.2em]"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value)}
                  maxLength={12}
                  autoCapitalize="characters"
                />
              </div>
            )}

            {ended && !error && (
              <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
                {t("auth.endedExpired")}
              </div>
            )}
            {error && (
              <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div>
            )}

            <button type="submit" disabled={loading} className="c-btn-primary w-full">
              {loading ? t("action.saving") : t(mode === "signin" ? "app.signIn" : "app.createAccount")}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-white/30">{t("app.loginHint")}</p>
      </div>
    </div>
  );
}

export default function CustomerLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-primary-950" />}>
      <CustomerLoginInner />
    </Suspense>
  );
}
