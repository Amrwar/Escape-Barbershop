"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import { Icon } from "@/components/ui/Icon";
import { ActionBar, Avatar, EmptyState, Pill, ScreenTitle, Skeleton } from "@/components/customer/kit";
import { JoinWaitlist } from "@/components/customer/WaitlistCard";

/**
 * Booking, in the order a customer thinks: what am I having, with whom, when.
 * Every time offered comes from the server, so nothing already taken is shown,
 * and the one action that moves things along sits under the thumb throughout.
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
  /** A few of their own cuts, so a barber is chosen by the work. */
  work?: string[];
  rating?: { average: number | null; count: number };
}

interface Catalog {
  services: Service[];
  barbers: Barber[];
  booking: { onlineBookingEnabled: boolean; maxDaysAhead: number; cancelWindowMinutes: number };
}

const STEPS = ["service", "barber", "time", "confirm"] as const;
type Step = (typeof STEPS)[number];

const TZ = "Africa/Cairo";
const dateIn = (days: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(Date.now() + days * 86_400_000)
  );

/** Times read more easily in parts of the day than as one long list. */
function groupByPartOfDay(slots: string[]) {
  const groups: { key: "app.morning" | "app.afternoon" | "app.evening"; slots: string[] }[] = [
    { key: "app.morning", slots: [] },
    { key: "app.afternoon", slots: [] },
    { key: "app.evening", slots: [] },
  ];
  for (const iso of slots) {
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date(iso)));
    const index = hour < 12 ? 0 : hour < 17 ? 1 : 2;
    groups[index].slots.push(iso);
  }
  return groups.filter((g) => g.slots.length > 0);
}

export default function BookPage() {
  const router = useRouter();
  const { t, fmtCurrency, fmtTime, lang } = useTranslation();

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [step, setStep] = useState<Step>("service");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [barberId, setBarberId] = useState<string | null>(null);
  const [day, setDay] = useState(() => dateIn(0));
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

  const chosen = useMemo(() => (catalog?.services ?? []).filter((s) => serviceIds.includes(s.id)), [catalog, serviceIds]);
  const totalPrice = chosen.reduce((s, x) => s + x.defaultPrice, 0);
  const totalMinutes = chosen.reduce((s, x) => s + x.durationMinutes, 0);
  const barber = catalog?.barbers.find((b) => b.id === barberId) ?? null;

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

  if (!catalog) {
    return (
      <div className="space-y-3 pt-4">
        <Skeleton className="h-8 w-1/2" />
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }

  if (!catalog.booking.onlineBookingEnabled) {
    return (
      <div className="pt-6">
        <EmptyState icon="receipt" title={t("app.bookingClosed")} hint={t("app.bookingClosedHint")} />
      </div>
    );
  }

  const stepIndex = STEPS.indexOf(step);
  const canGoOn = step === "service" ? chosen.length > 0 : step === "time" ? !!time : true;
  const days = Array.from({ length: Math.min(catalog.booking.maxDaysAhead, 14) }, (_, i) => dateIn(i));

  return (
    <div className="pt-2">
      {/* How far along, and what it is costing so far */}
      <div className="sticky top-0 z-10 -mx-5 mb-5 bg-app px-5 pb-3 pt-2 backdrop-blur-lg">
        <div className="flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                i < stepIndex ? "bg-accent" : i === stepIndex ? "bg-accent" : "bg-raised"
              }`}
            />
          ))}
        </div>
        {chosen.length > 0 && (
          <div className="mt-2.5 flex items-center justify-between text-[13px]">
            <span className="truncate text-mid">
              {chosen.map((s) => (lang === "ar" && s.arabicName ? s.arabicName : s.name)).join(" + ")}
              <span className="text-faint">
                {" · "}
                {totalMinutes} {t("appointments.minutesShort")}
              </span>
            </span>
            <span className="ms-3 shrink-0 font-semibold tabular-nums text-accent">{fmtCurrency(totalPrice)}</span>
          </div>
        )}
      </div>

      {step === "service" && (
        <section className="space-y-4">
          <ScreenTitle title={t("app.stepService")} hint={t("app.stepServiceHint")} />
          <div className="space-y-2">
            {catalog.services.map((s) => {
              const on = serviceIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setServiceIds((prev) => (on ? prev.filter((x) => x !== s.id) : [...prev, s.id]))}
                  className={`c-choice flex w-full items-center gap-4 p-4 text-start ${on ? "c-choice-on" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{lang === "ar" && s.arabicName ? s.arabicName : s.name}</div>
                    <div className="mt-1 text-xs text-soft">
                      {s.durationMinutes} {t("appointments.minutesShort")}
                    </div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums text-ink">{fmtCurrency(s.defaultPrice)}</div>
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                      on ? "border-accent bg-accent text-accent-ink" : "border-hair"
                    }`}
                  >
                    {on && <span className="text-xs font-bold">✓</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {step === "barber" && (
        <section className="space-y-4">
          <ScreenTitle title={t("app.stepBarber")} hint={t("app.stepBarberHint")} />
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setBarberId(null)}
              className={`c-choice flex w-full items-center gap-4 p-4 text-start ${barberId === null ? "c-choice-on" : ""}`}
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent">
                <Icon name="users" className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="font-medium">{t("appointments.anyBarber")}</div>
                <div className="mt-0.5 text-xs text-soft">{t("app.anyBarberHint")}</div>
              </div>
              {barberId === null && <Pill tone="brass">✓</Pill>}
            </button>

            {availableBarbers.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setBarberId(b.id)}
                className={`c-choice flex w-full items-center gap-4 p-4 text-start ${barberId === b.id ? "c-choice-on" : ""}`}
              >
                <Avatar name={b.name} photo={b.photo} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{b.name}</span>
                    {b.rating?.average != null && (
                      <span className="text-xs text-accent">★ {b.rating.average.toFixed(1)}</span>
                    )}
                  </div>
                  {b.bio && <div className="mt-0.5 truncate text-xs text-soft">{b.bio}</div>}

                  {/* Their own work, which is what a customer actually chooses on. */}
                  {(b.work?.length ?? 0) > 0 && (
                    <div className="mt-2 flex gap-1.5">
                      {b.work!.map((image, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={i}
                          src={image}
                          alt=""
                          className="h-12 w-12 shrink-0 border border-hair object-cover"
                        />
                      ))}
                    </div>
                  )}
                </div>
                {barberId === b.id && <Pill tone="brass">✓</Pill>}
              </button>
            ))}
          </div>
        </section>
      )}

      {step === "time" && (
        <section className="space-y-4">
          <ScreenTitle title={t("app.stepTime")} hint={t("app.stepTimeHint")} />

          <div className="scroll-clean -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
            {days.map((d, i) => {
              const date = new Date(`${d}T12:00:00`);
              const on = d === day;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDay(d)}
                  className={`c-choice w-[68px] shrink-0 py-2.5 text-center ${on ? "c-choice-on" : ""}`}
                >
                  <div className={`text-[10px] uppercase tracking-wide ${on ? "text-accent" : "text-soft"}`}>
                    {i === 0
                      ? t("app.today")
                      : new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-GB", { weekday: "short", timeZone: TZ }).format(date)}
                  </div>
                  <div className="text-xl font-bold leading-tight tabular-nums">{date.getDate()}</div>
                </button>
              );
            })}
          </div>

          {slots === null ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {[...Array(9)].map((_, i) => (
                <Skeleton key={i} className="h-11 rounded-[3px]" />
              ))}
            </div>
          ) : slots.length === 0 ? (
            <div className="space-y-4">
              <EmptyState icon="calendar" title={t("app.noTimesThatDay")} hint={t("app.noTimesThatDayHint")} />
              <JoinWaitlist dateISO={day} serviceIds={serviceIds} barberId={barberId} />
            </div>
          ) : (
            <div className="space-y-5">
              {groupByPartOfDay(slots).map((group) => (
                <div key={group.key}>
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">{t(group.key)}</div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {group.slots.map((iso) => (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => setTime(iso)}
                        className={`c-choice py-2.5 text-sm font-medium tabular-nums ${time === iso ? "c-choice-on" : ""}`}
                      >
                        {fmtTime(iso)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {step === "confirm" && time && (
        <section className="space-y-4">
          <ScreenTitle title={t("app.stepConfirm")} hint={t("app.stepConfirmHint")} />

          <div className="c-card-raised overflow-hidden">
            <div className="border-b border-hair bg-surface px-5 py-4">
              <div className="c-display text-3xl tabular-nums leading-none">{fmtTime(time)}</div>
              <div className="mt-1.5 text-sm text-soft">
                {new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-GB", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  timeZone: TZ,
                }).format(new Date(time))}
              </div>
            </div>

            <div className="space-y-3 px-5 py-4">
              {chosen.map((s) => (
                <div key={s.id} className="flex items-baseline justify-between text-sm">
                  <span className="text-mid">{lang === "ar" && s.arabicName ? s.arabicName : s.name}</span>
                  <span className="tabular-nums text-ink">{fmtCurrency(s.defaultPrice)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-hair pt-3">
                <div className="flex items-center gap-2.5">
                  <Avatar name={barber?.name ?? "?"} photo={barber?.photo} size={32} />
                  <span className="text-sm text-mid">{barber?.name ?? t("appointments.anyBarber")}</span>
                </div>
                <Pill>
                  {totalMinutes} {t("appointments.minutesShort")}
                </Pill>
              </div>
              <div className="flex items-baseline justify-between border-t border-hair pt-3">
                <span className="font-semibold">{t("field.total")}</span>
                <span className="text-xl font-bold tabular-nums text-accent">{fmtCurrency(totalPrice)}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="c-label">{t("app.notesOptional")}</label>
            <input className="c-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("app.notesPlaceholder")} />
          </div>

          <p className="text-center text-xs text-faint">
            {t("app.cancelPolicy").replace("{minutes}", String(catalog.booking.cancelWindowMinutes))}
          </p>
        </section>
      )}

      {error && (
        <div className="mt-4 rounded-[3px] border border-bad bg-bad-soft px-4 py-3 text-sm text-bad">{error}</div>
      )}

      <ActionBar>
        {stepIndex > 0 && (
          <button type="button" onClick={() => setStep(STEPS[stepIndex - 1])} className="c-btn-secondary px-5">
            {t("app.back")}
          </button>
        )}
        {step === "confirm" ? (
          <button type="button" onClick={book} disabled={saving} className="c-btn-primary flex-1">
            {saving ? t("action.saving") : t("app.confirmBooking")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStep(STEPS[stepIndex + 1])}
            disabled={!canGoOn}
            className="c-btn-primary flex-1"
          >
            {t("action.next")}
            {step === "service" && chosen.length > 0 && <span className="tabular-nums opacity-80">· {fmtCurrency(totalPrice)}</span>}
          </button>
        )}
      </ActionBar>
    </div>
  );
}
