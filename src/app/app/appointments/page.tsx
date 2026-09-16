"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n";
import { AppointmentCard, type CustomerAppointment } from "@/components/customer/AppointmentCard";

/** The customer's own bookings: what is coming, and what has been. */
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
      const timer = setTimeout(() => setJustBooked(false), 6000);
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
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">{t("app.myAppointments")}</h1>

      {justBooked && (
        <div className="bg-green-50 text-green-800 text-sm px-4 py-3 rounded-lg border border-green-200">
          ✓ {t("app.bookedConfirmation")}
        </div>
      )}

      <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-xl">
        {(["upcoming", "past"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === key ? "bg-white shadow-sm text-gray-900" : "text-gray-500"
            }`}
          >
            {t(key === "upcoming" ? "app.upcoming" : "app.past")}
          </button>
        ))}
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">{error}</div>}

      {items === null ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card h-28 animate-pulse bg-gray-100" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="text-3xl mb-2">{tab === "upcoming" ? "📅" : "🗂️"}</div>
          <p className="text-sm text-gray-500 mb-4">{t(tab === "upcoming" ? "app.nothingBooked" : "app.noHistory")}</p>
          {tab === "upcoming" && (
            <Link href="/app/book" className="btn-primary inline-flex">
              {t("app.bookNow")}
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <AppointmentCard
              key={a.id}
              appointment={a}
              actions={
                tab === "upcoming" ? (
                  <button
                    type="button"
                    onClick={() => cancel(a)}
                    disabled={busyId === a.id}
                    className="btn-ghost text-sm text-red-500 px-3 py-1.5"
                  >
                    {busyId === a.id ? "…" : t("action.cancel")}
                  </button>
                ) : undefined
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
    <Suspense fallback={<div className="card h-40 animate-pulse bg-gray-100" />}>
      <AppointmentsInner />
    </Suspense>
  );
}
