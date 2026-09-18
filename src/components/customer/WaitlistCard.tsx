"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n";

/**
 * The waiting list, from the customer's side.
 *
 * Two jobs on one card. When a day is full it offers to put them on the list;
 * when a chair has opened it says so and books it in one tap. The countdown is
 * honest — the offer really does pass to the next person — because a deadline
 * nobody enforces teaches people to ignore deadlines.
 */

export interface WaitlistEntry {
  id: string;
  dateISO: string;
  barber: { id: string; name: string } | null;
  services: { id: string; name: string; arabicName: string | null }[];
  status: string;
  offer: { startAt: string; expiresAt: string } | null;
}

export function WaitlistOffer({ entry, onTaken }: { entry: WaitlistEntry; onTaken?: () => void }) {
  const router = useRouter();
  const { t, fmtDate, fmtTime } = useTranslation();
  const [taking, setTaking] = useState(false);
  const [error, setError] = useState("");

  if (!entry.offer) return null;

  const take = async () => {
    setTaking(true);
    setError("");
    try {
      const res = await fetch(`/api/customer/waitlist/${entry.id}/claim`, { method: "POST" });
      if (res.ok) {
        onTaken?.();
        router.push("/app/appointments");
        router.refresh();
        return;
      }
      setError((await res.json())?.error ?? t("app.waitlistGone"));
    } catch {
      setError(t("appointments.networkError"));
    } finally {
      setTaking(false);
    }
  };

  return (
    <div className="c-card-raised animate-fade-up p-5">
      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-accent">{t("app.waitlistOpened")}</div>

      <div className="mt-3 flex items-end justify-between gap-4">
        <div>
          <div className="c-display text-3xl leading-none text-ink">{fmtTime(entry.offer.startAt)}</div>
          <div className="mt-1 text-sm text-soft">{fmtDate(entry.offer.startAt)}</div>
        </div>
        {entry.barber && <div className="text-sm text-mid">{entry.barber.name}</div>}
      </div>

      <button type="button" onClick={take} disabled={taking} className="c-btn-primary mt-4 w-full">
        {taking ? "…" : t("app.waitlistTake")}
      </button>

      <p className="mt-2 text-center text-[11px] text-faint">{t("app.waitlistHurry")}</p>
      {error && <p className="mt-2 text-center text-xs text-bad">{error}</p>}
    </div>
  );
}

/** "Tell me if something opens" — shown when a day has nothing left. */
export function JoinWaitlist({
  dateISO,
  serviceIds,
  barberId,
  onJoined,
}: {
  dateISO: string;
  serviceIds: string[];
  barberId: string | null;
  onJoined?: () => void;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<"idle" | "joining" | "joined">("idle");
  const [error, setError] = useState("");

  const join = async () => {
    setState("joining");
    setError("");
    try {
      const res = await fetch("/api/customer/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateISO, serviceIds, barberId }),
      });
      if (res.ok) {
        setState("joined");
        onJoined?.();
        return;
      }
      setError((await res.json())?.error ?? t("app.waitlistFailed"));
      setState("idle");
    } catch {
      setError(t("appointments.networkError"));
      setState("idle");
    }
  };

  if (state === "joined") {
    return (
      <div className="c-card animate-fade-up p-5 text-center">
        <div className="text-sm font-medium text-accent">{t("app.waitlistJoined")}</div>
        <p className="mt-1 text-sm text-mid">{t("app.waitlistJoinedHint")}</p>
      </div>
    );
  }

  return (
    <div className="c-card animate-fade-up p-5 text-center">
      <p className="text-sm text-mid">{t("app.waitlistFullDay")}</p>
      <button
        type="button"
        onClick={join}
        disabled={state === "joining" || serviceIds.length === 0}
        className="c-btn-secondary mt-3 w-full"
      >
        {state === "joining" ? "…" : t("app.waitlistJoin")}
      </button>
      {error && <p className="mt-2 text-xs text-bad">{error}</p>}
    </div>
  );
}
