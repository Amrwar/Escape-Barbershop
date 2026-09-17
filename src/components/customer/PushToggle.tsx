"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n";

/**
 * "Remind me about my appointments." One switch, and an honest line about what
 * it can and cannot do on an iPhone — Apple only allows notifications once the
 * app has been added to the Home Screen, and a customer who is not told that
 * will think it is broken.
 */

type State = "loading" | "unsupported" | "needs-install" | "off" | "on" | "blocked";

/** The key arrives as URL-safe base64; the browser wants raw bytes. */
function urlBase64ToBytes(base64: string): ArrayBuffer {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const isInstalled = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

export function PushToggle() {
  const { t } = useTranslation();
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      // An iPhone that has not been added to the Home Screen has no PushManager.
      setState(isIos() && !isInstalled() ? "needs-install" : "unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("blocked");
      return;
    }

    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setState(subscription ? "on" : "off"))
      .catch(() => setState("off"));
  }, []);

  const turnOn = async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }

      const { publicKey } = await fetch("/api/push/subscribe").then((r) => r.json());
      if (!publicKey) return;

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBytes(publicKey),
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      setState(res.ok ? "on" : "off");
    } catch {
      setState("off");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(subscription.endpoint)}`, { method: "DELETE" });
        await subscription.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  };

  if (state === "loading") return null;

  return (
    <div className="c-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-medium text-ink">{t("app.remindMe")}</div>
          <p className="mt-1 text-sm text-soft">
            {state === "needs-install"
              ? t("app.remindIos")
              : state === "unsupported"
                ? t("app.remindUnsupported")
                : state === "blocked"
                  ? t("app.remindBlocked")
                  : t("app.remindHint")}
          </p>
        </div>

        {(state === "on" || state === "off") && (
          <button
            type="button"
            onClick={state === "on" ? turnOff : turnOn}
            disabled={busy}
            aria-pressed={state === "on"}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
              state === "on" ? "bg-accent" : "bg-line"
            } disabled:opacity-50`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full transition-all ${
                state === "on" ? "bg-accent-ink" : "bg-surface"
              } ${
                state === "on" ? "start-6" : "start-1"
              }`}
            />
          </button>
        )}
      </div>
    </div>
  );
}
