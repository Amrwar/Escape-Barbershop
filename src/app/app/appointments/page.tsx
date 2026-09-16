"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n";
import { AppointmentCard, type CustomerAppointment } from "@/components/customer/AppointmentCard";
import { EmptyState, ScreenTitle, Skeleton } from "@/components/customer/kit";

/** Everything the customer has booked: what is coming, and what has been. */
function AppointmentsInner() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [items, setItems] = useState<CustomerAppointment[] | null>(null);
  const [justBooked, setJustBooked] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setItems(null);
    fetch(`/api/customer/appointments?scope=${tab}`)
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch(() => setItems([]));
  }, [tab]);

  useEffect(load, [load]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("booked")) {
      setJustBooked(true);
      window.history.replaceState({}, "", "/app/appointments");
      const timer = setTimeout(() => setJustBooked(false), 7000);
      return () => clearTimeout(timer);
    }
  }, []);

  const cancel = async (a: CustomerAppointment) => {
    if (!confirm(t("app.cancelConfirm"))) return;
    setBusyId(a.id);
    setError("");
    try {
      const res = await fetch(`/api/customer/appointments/${a.id}`, { method: "DELETE" });
      if (!res.ok) setError((await res.json()).error ?? t("appointments.actionFailed"));
      load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5 pt-2">
      <ScreenTitle title={t("app.myAppointments")} />

      {justBooked && (
        <div className="animate-fade-up flex items-center gap-3 rounded-2xl border border-brass-400/30 bg-brass-400/10 px-4 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brass-400 text-primary-950">✓</span>
          <p className="text-sm text-brass-100">{t("app.bookedConfirmation")}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
        {(["upcoming", "past"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-lg py-2 text-sm font-medium transition-colors ${
              tab === key ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"
            }`}
          >
            {t(key === "upcoming" ? "app.upcoming" : "app.past")}
          </button>
        ))}
      </div>

      {error && <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div>}

      {items === null ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={tab === "upcoming" ? "calendar" : "list"}
          title={t(tab === "upcoming" ? "app.nothingBooked" : "app.noHistory")}
          hint={tab === "upcoming" ? t("app.nothingBookedHint") : undefined}
          action={
            tab === "upcoming" ? (
              <Link href="/app/book" className="c-btn-primary">
                {t("app.bookNow")}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          {items.map((a, i) => (
            <AppointmentCard
              key={a.id}
              appointment={a}
              highlight={tab === "upcoming" && i === 0}
              actions={
                tab === "upcoming" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => cancel(a)}
                      disabled={busyId === a.id}
                      className="c-btn-ghost flex-1 text-red-300 hover:bg-red-400/10 hover:text-red-200"
                    >
                      {busyId === a.id ? "…" : t("action.cancel")}
                    </button>
                    {i === 0 && (
                      <Link href="/app/book" className="c-btn-secondary flex-1">
                        {t("app.bookAnother")}
                      </Link>
                    )}
                  </>
                ) : (
                  <Link href="/app/book" className="c-btn-ghost flex-1">
                    {t("app.bookAgain")}
                  </Link>
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CustomerAppointmentsPage() {
  return (
    <Suspense fallback={<Skeleton className="mt-6 h-40" />}>
      <AppointmentsInner />
    </Suspense>
  );
}
