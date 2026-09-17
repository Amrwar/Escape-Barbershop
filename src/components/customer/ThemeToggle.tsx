"use client";

import { useEffect, useState } from "react";

/**
 * Night or day.
 *
 * The shop is dark by default, because that is when most people book and it is
 * what the room looks like. Anyone who reads it in daylight — or simply prefers
 * paper — turns it over here, and the choice is remembered on that phone.
 *
 * The switch is drawn, not written: a sun and a moon need no translating.
 */

type Theme = "dark" | "light";
const KEY = "escape-app-theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {
      // A private window with storage blocked: dark it is.
    }
  }, []);

  const choose = (next: Theme) => {
    setTheme(next);
    document.documentElement.dataset.appTheme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Not remembering the choice is better than failing on it.
    }
  };

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={() => choose(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light" : "Switch to dark"}
      className="flex h-8 w-8 items-center justify-center rounded-[3px] border border-hair text-soft transition-colors hover:text-accent"
    >
      {isDark ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
