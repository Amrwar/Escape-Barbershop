"use client";

import { useEffect, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import { ACTIVITY_PING_MS, IDLE_TIMEOUT_MS, MAX_SESSION_MS } from "@/lib/session-policy";

/**
 * Signs the device out after inactivity or when the login reaches its cap. The
 * server enforces both anyway; this keeps an idle screen from staying open and
 * tells the server the device is in use, since only the browser sees the taps.
 * Activity is shared across tabs so a busy tab keeps a quiet one signed in.
 */

const LAST_ACTIVITY_KEY = "escape.lastActivity";
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
const CHECK_EVERY_MS = 15 * 1000;

function readSharedActivity(): number {
  try {
    return Number(localStorage.getItem(LAST_ACTIVITY_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeSharedActivity(at: number) {
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(at));
  } catch {
    // private mode or blocked storage: this tab still tracks itself
  }
}

export function SessionTimeout() {
  const { data: session, status } = useSession();
  const loginAt = session?.loginAt;
  const wasSignedIn = useRef(false);

  // Signed out somewhere else (another tab, or the server ended it on a check).
  useEffect(() => {
    if (status === "authenticated") wasSignedIn.current = true;
    else if (status === "unauthenticated" && wasSignedIn.current) {
      wasSignedIn.current = false;
      window.location.href = "/login?ended=expired";
    }
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated") return;

    let lastActivity = Date.now();
    let lastShared = 0;
    let lastPing = Date.now();
    let ending = false;
    writeSharedActivity(lastActivity);

    const end = (reason: "idle" | "max" | "expired") => {
      if (ending) return;
      ending = true;
      wasSignedIn.current = false;
      signOut({ callbackUrl: `/login?ended=${reason}` });
    };

    const check = () => {
      const now = Date.now();
      if (typeof loginAt === "number" && now - loginAt >= MAX_SESSION_MS) return end("max");
      if (now - Math.max(lastActivity, readSharedActivity()) >= IDLE_TIMEOUT_MS) end("idle");
    };

    const onActivity = () => {
      const now = Date.now();
      // Coming back to a screen that already sat idle too long does not revive it.
      check();
      if (ending) return;
      lastActivity = now;
      if (now - lastShared >= 5000) {
        lastShared = now;
        writeSharedActivity(now);
      }
      if (now - lastPing >= ACTIVITY_PING_MS) {
        lastPing = now;
        // Re-issues the cookie, which pushes the server's idle deadline forward.
        fetch("/api/auth/session", { cache: "no-store" })
          .then((res) => res.json())
          .then((body) => {
            if (!body?.user) end("expired");
          })
          .catch(() => {});
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };

    for (const e of ACTIVITY_EVENTS) window.addEventListener(e, onActivity, { capture: true, passive: true });
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(check, CHECK_EVERY_MS);

    return () => {
      for (const e of ACTIVITY_EVENTS) window.removeEventListener(e, onActivity, { capture: true });
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [status, loginAt]);

  return null;
}
