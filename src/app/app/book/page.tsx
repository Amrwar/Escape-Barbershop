"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import { Icon } from "@/components/ui/Icon";

/**
 * Booking, in the order a customer thinks: what do I want, with whom, which
 * day, what time. Every time offered comes from the server, so nothing that is
 * already taken is ever shown.
 */

interface Service {
  id: string;
  name: string;
  arabicName: string | null;
  defaultPrice: number;
  durationMinutes: number;
}

interface Barber {
  id: string;
  name: string;
  bio: string | null;
  photo: string | null;
  serviceIds: string[];
}

interface Catalog {
  services: Service[];
  barbers: Barber[];
  booking: { onlineBookingEnabled: boolean; maxDaysAhead: number; cancelWindowMinutes: number };
}

const STEPS = ["service", "barber", "time", "confirm"] as const;
type Step = (typeof STEPS)[number];

/** The next `count` days, as shop-local dates. */
function nextDays(count: number): string[] {
  const days: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    days.push(
      new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d)
    );
  }
  return days;
}

export default function BookPage() {
  const router = useRouter();
  const { t, fmtCurrency, fmtTime, lang } = useTranslation();

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [step, setStep] = useState<Step>("service");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [barberId, setBarberId] = useState<string | null>(null);
  const [day, setDay] = useState(() => nextDays(1)[0]);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/customer/catalog")
      .then((r) => r.json())
      .then(setCatalog)
      .catch(() => setCatalog(null));
  }, []);

  const chosenServices = useMemo(
    () => (catalog?.services ?? []).filter((s) => serviceIds.includes(s.id)),
    [catalog, serviceIds]
  );
  const totalPrice = chosenServices.reduce((s, x) => s + x.defaultPrice, 0);
  const totalMinutes = chosenServices.reduce((s, x) => s + x.durationMinutes, 0);
  const barber = catalog?.barbers.find((b) => b.id === barberId) ?? null;

  // Barbers who can do everything chosen (an empty list means "all services").
  const availableBarbers = useMemo(
    () => (catalog?.barbers ?? []).filter((b) => b.serviceIds.length === 0 || serviceIds.every((id) => b.serviceIds.includes(id))),
    [catalog, serviceIds]
  );

  useEffect(() => {
    if (step !== "time" || serviceIds.length === 0) return;
    setSlots(null);
    setTime(null);
    const params = new URLSearchParams({ date: day, serviceIds: serviceIds.join(",") });
    if (barberId) params.set("barberId", barberId);
    fetch(`/api/customer/slots?${params}`)
      .then((r) => r.json())
      .then((d) => setSlots(Array.isArray(d?.anyBarber) ? d.anyBarber : []))
      .catch(() => setSlots([]));
  }, [step, day, serviceIds, barberId]);

  const book = async () => {
    if (!time) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/customer/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barberId, startAt: time, serviceIds, notes }),
      });
      if (res.ok) {
        router.push("/app/appointments?booked=1");
        router.refresh();
      } else {
        setError((await res.json()).error ?? t("appointments.actionFailed"));
        setStep("time");
      }
    } catch {
      setError(t("appointments.networkError"));
    } finally {
      setSaving(false);
    }
  };

  if (!catalog) return <div className="card h-64 animate-pulse bg-gray-100" />;

  if (!catalog.booking.onlineBookingEnabled) {
    return (
      <div className="card p-6 text-center">
        <div className="text-3xl mb-2">📞</div>
        <p className="text-sm text-gray-600">{t("app.bookingClosed")}</p>
      </div>
    );
  }

  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="space-y-5">
      {/* Where the customer is in the flow */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= stepIndex ? "bg-primary-700" : "bg-gray-200"}`} />
        ))}
      </div>

      {step === "service" && (
        <section className="space-y-3">
          <StepTitle title={t("app.stepService")} hint={t("app.stepServiceHint")} />
          <div className="space-y-2">
            {catalog.services.map((s) => {
              const on = serviceIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setServiceIds((prev) => (on ? prev.filter((x) => x !== s.id) : [...prev, s.id]))}
                  className={`w-full text-start card p-4 flex items-center gap-3 transition-colors ${
                    on ? "border-primary-500 bg-primary-50/50" : "hover:border-primary-200"
                  }`}
                >
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">{lang === "ar" && s.arabicName ? s.arabicName : s.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {s.durationMinutes} {t("appointments.minutesShort")}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-gray-900 tabular-nums">{fmtCurrency(s.defaultPrice)}</div>
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      on ? "border-primary-600 bg-primary-600 text-white" : "border-gray-300"
                    }`}
                  >
                    {on && <span className="text-[11px]">✓</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {step === "barber" && (
        <section className="space-y-3">
          <StepTitle title={t("app.stepBarber")} hint={t("app.stepBarberHint")} />
          <button
            type="button"
            onClick={() => setBarberId(null)}
            className={`w-full text-start card p-4 flex items-center gap-3 ${
              barberId === null ? "border-primary-500 bg-primary-50/50" : "hover:border-primary-200"
            }`}
          >
            <div className="w-11 h-11 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center">
              <Icon name="users" className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-gray-900">{t("appointments.anyBarber")}</div>
              <div className="text-xs text-gray-500">{t("app.anyBarberHint")}</div>
            </div>
          </button>

          {availableBarbers.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setBarberId(b.id)}
              className={`w-full text-start card p-4 flex items-center gap-3 ${
                barberId === b.id ? "border-primary-500 bg-primary-50/50" : "hover:border-primary-200"
              }`}
            >
              <div className="w-11 h-11 rounded-full bg-primary-100 text-primary-800 font-bold flex items-center justify-center">
                {b.name[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900">{b.name}</div>
                {b.bio && <div className="text-xs text-gray-500 truncate">{b.bio}</div>}
              </div>
            </button>
          ))}
        </section>
      )}

      {step === "time" && (
        <section className="space-y-3">
          <StepTitle title={t("app.stepTime")} hint={t("app.stepTimeHint")} />

          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {nextDays(catalog.booking.maxDaysAhead > 14 ? 14 : catalog.booking.maxDaysAhead).map((d) => {
              const date = new Date(`${d}T12:00:00`);
              const on = d === day;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDay(d)}
                  className={`shrink-0 w-16 py-2 rounded-xl border text-center transition-colors ${
                    on ? "border-primary-600 bg-primary-700 text-white" : "border-gray-200 bg-white hover:border-primary-300"
                  }`}
                >
                  <div className="text-[11px] uppercase opacity-80">
                    {new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-GB", { weekday: "short" }).format(date)}
                  </div>
                  <div className="text-lg font-bold tabular-nums leading-tight">{date.getDate()}</div>
                </button>
              );
            })}
          </div>

          {slots === null ? (
            <div className="grid grid-cols-3 gap-2">
              {[...Array(9)].map((_, i) => (
                <div key={i} className="h-10 rounded-xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : slots.length === 0 ? (
            <div className="card p-6 text-center text-sm text-gray-500">{t("app.noTimesThatDay")}</div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {slots.map((iso) => (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setTime(iso)}
                  className={`py-2.5 rounded-xl border text-sm font-medium tabular-nums transition-colors ${
                    time === iso ? "border-primary-600 bg-primary-700 text-white" : "border-gray-200 bg-white hover:border-primary-300"
                  }`}
                >
                  {fmtTime(iso)}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {step === "confirm" && time && (
        <section className="space-y-3">
          <StepTitle title={t("app.stepConfirm")} hint={t("app.stepConfirmHint")} />
          <div className="card p-5 space-y-3">
            <Row label={t("field.services")} value={chosenServices.map((s) => (lang === "ar" && s.arabicName ? s.arabicName : s.name)).join(" + ")} />
            <Row label={t("field.barber")} value={barber?.name ?? t("appointments.anyBarber")} />
            <Row label={t("field.dateTime")} value={`${fmtTime(time)} · ${new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Cairo" }).format(new Date(time))}`} />
            <Row label={t("app.duration")} value={`${totalMinutes} ${t("appointments.minutesShort")}`} />
            <div className="flex justify-between pt-3 border-t border-gray-100">
              <span className="font-semibold text-gray-900">{t("field.total")}</span>
              <span className="font-bold text-gray-900 tabular-nums">{fmtCurrency(totalPrice)}</span>
            </div>
          </div>

          <div>
            <label className="label">{t("app.notesOptional")}</label>
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("app.notesPlaceholder")} />
          </div>

          <p className="text-xs text-gray-500">
            {t("app.cancelPolicy").replace("{minutes}", String(catalog.booking.cancelWindowMinutes))}
          </p>
        </section>
      )}

      {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">{error}</div>}

      {/* The one action that moves things along, always within thumb reach */}
      <div className="flex gap-3">
        {stepIndex > 0 && (
          <button type="button" onClick={() => setStep(STEPS[stepIndex - 1])} className="btn-secondary flex-1">
            {t("action.back").replace("←", "").trim()}
          </button>
        )}
        {step === "confirm" ? (
          <button type="button" onClick={book} disabled={saving} className="btn-primary flex-[2]">
            {saving ? t("action.saving") : t("app.confirmBooking")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStep(STEPS[stepIndex + 1])}
            disabled={(step === "service" && serviceIds.length === 0) || (step === "time" && !time)}
            className="btn-primary flex-[2]"
          >
            {step === "service" && serviceIds.length > 0
              ? `${t("action.next")} · ${fmtCurrency(totalPrice)}`
              : t("action.next")}
          </button>
        )}
      </div>
    </div>
  );
}

function StepTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <h1 className="text-lg font-bold text-gray-900">{title}</h1>
      <p className="text-sm text-gray-500">{hint}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-900 font-medium text-end">{value}</span>
    </div>
  );
}
