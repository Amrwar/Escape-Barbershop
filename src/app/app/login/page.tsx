"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { customerRegisterSchema } from "@/lib/validations";
import { isValidPhone } from "@/lib/customers";

/** Where a customer signs in, or makes an account with their phone number. */
function CustomerLoginInner() {
  const router = useRouter();
  const { t } = useTranslation();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [ended, setEnded] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setEnded(new URLSearchParams(window.location.search).has("ended"));
  }, []);

  const goToApp = async () => {
    const res = await signIn("credentials", { email: phone, password, redirect: false });
    if (res?.error) {
      setError(t("app.wrongLogin"));
      return false;
    }
    router.push("/app");
    router.refresh();
    return true;
  };

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
        const parsed = customerRegisterSchema.safeParse({ name, phone, password });
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
      await goToApp();
    } catch {
      setError(t("appointments.networkError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary-900 via-primary-950 to-black p-4">
      <div className="fixed top-4 end-4">
        <LanguageToggle />
      </div>

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Image src="/logo.jpg" alt="Escape Barbershop" width={104} height={104} className="rounded-2xl shadow-lg" priority />
          </div>
          <h1 className="text-white text-xl font-bold tracking-[0.22em] uppercase">Escape</h1>
          <p className="text-primary-300 mt-1 text-sm tracking-wide">{t("app.loginSubtitle")}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-7">
          <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-xl mb-6">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(""); }}
                className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                  mode === m ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t(m === "signin" ? "app.signIn" : "app.createAccount")}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="label" htmlFor="name">{t("field.name")}</label>
                <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
              </div>
            )}

            <div>
              <label className="label" htmlFor="phone">{t("field.phone")}</label>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                className="input"
                placeholder="01X XXXX XXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                required
              />
            </div>

            <div>
              <label className="label" htmlFor="password">{t("auth.password")}</label>
              <input
                id="password"
                type="password"
                className="input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                required
              />
            </div>

            {ended && !error && (
              <div className="bg-amber-50 text-amber-800 text-sm px-4 py-3 rounded-lg border border-amber-200">
                {t("auth.endedExpired")}
              </div>
            )}
            {error && (
              <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">{error}</div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
              {loading ? t("action.saving") : t(mode === "signin" ? "app.signIn" : "app.createAccount")}
            </button>
          </form>
        </div>

        <p className="text-center text-primary-400 text-xs mt-6">{t("app.loginHint")}</p>
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
