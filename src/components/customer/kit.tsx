"use client";

import { Icon, type IconName } from "@/components/ui/Icon";

/**
 * The pieces every customer screen is built from. Small on purpose: one card,
 * one heading, one empty state, one skeleton — so the app looks like one thing
 * rather than four screens that happen to share a colour.
 */

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">{children}</h2>
      {action}
    </div>
  );
}

export function ScreenTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="animate-fade-up">
      <h1 className="text-[26px] font-bold leading-tight tracking-tight text-white">{title}</h1>
      {hint && <p className="mt-1 text-sm text-white/45">{hint}</p>}
    </div>
  );
}

/** Initials until the shop has photos; the slot is the same size either way. */
export function Avatar({ name, photo, size = 44 }: { name: string; photo?: string | null; size?: number }) {
  const initial = name?.trim()?.[0]?.toUpperCase() ?? "?";
  return (
    <div
      className="c-photo-slot shrink-0 overflow-hidden rounded-full ring-1 ring-white/10"
      style={{ width: size, height: size }}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span className="font-semibold text-white/70" style={{ fontSize: size * 0.4 }}>
          {initial}
        </span>
      )}
    </div>
  );
}

export function EmptyState({
  icon = "scissors",
  title,
  hint,
  action,
}: {
  icon?: IconName;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="c-card animate-fade-up p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06] text-white/50">
        <Icon name={icon} className="h-6 w-6" />
      </div>
      <p className="font-medium text-white">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-xs text-sm text-white/40">{hint}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = "h-24" }: { className?: string }) {
  return <div className={`c-skeleton ${className}`} />;
}

/** A small label: a status, a length, a count. */
export function Pill({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "brass" | "good" | "warn" | "bad";
}) {
  const tones = {
    muted: "bg-white/[0.06] text-white/60 ring-white/10",
    brass: "bg-brass-400/15 text-brass-200 ring-brass-400/30",
    good: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/20",
    warn: "bg-amber-400/10 text-amber-300 ring-amber-400/20",
    bad: "bg-red-400/10 text-red-300 ring-red-400/20",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** The bar that sits above the tab bar carrying a screen's one action. */
export function ActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-[72px] z-10 border-t border-white/10 bg-primary-950/90 px-5 py-3 backdrop-blur-lg">
      <div className="mx-auto flex max-w-2xl gap-3">{children}</div>
    </div>
  );
}
