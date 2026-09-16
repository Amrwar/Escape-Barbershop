"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { DateNavInput } from "@/components/ui/DateNavInput";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { useTranslation } from "@/lib/i18n";
import { APPOINTMENT_BADGE, appointmentStatusKey } from "@/lib/appointments";

/**
 * The shop's day: who is coming, with whom, and what is left free. Booking,
 * moving and cancelling all happen here; ringing the visit up stays on the till.
 */

interface Appointment {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  source: string;
  notes: string | null;
  durationMinutes: number;
  totalPrice: number;
  customer: { id: string; name: string; phone: string | null };
  barber: { id: string; name: string } | null;
  services: { id: string; serviceId: string; serviceName: string; price: number; durationMinutes: number }[];
}

interface Service {
  id: string;
  name: string;
  arabicName: string | null;
  defaultPrice: number;
  durationMinutes: number;
  isActive: boolean;
}

interface Barber { id: string; name: string }
interface Customer { id: string; name: string; phone: string | null }

interface SlotResponse {
  durationMinutes: number;
  price: number;
  anyBarber: string[];
  perBarber: { barberId: string; barberName: string; slots: string[] }[];
}

export default function AppointmentsPage() {
  const { t, fmtCurrency, fmtTime, lang } = useTranslation();
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  const [booking, setBooking] = useState(false);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      from: new Date(`${date}T00:00:00`).toISOString(),
      to: new Date(`${date}T23:59:59`).toISOString(),
    });
    fetch(`/api/appointments?${params}`)
      .then((r) => r.json())
      .then((d) => setAppointments(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, [date]);

  useEffect(load, [load]);

  useEffect(() => {
    Promise.all([
      fetch("/api/barbers?active=true").then((r) => r.json()),
      fetch("/api/services?active=true").then((r) => r.json()),
    ]).then(([b, s]) => {
      setBarbers(Array.isArray(b) ? b : []);
      setServices(Array.isArray(s) ? (s as Service[]).filter((x) => x.isActive) : []);
    });
  }, []);

  const setStatus = async (a: Appointment, status: string) => {
    const res = await fetch(`/api/appointments/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) alert((await res.json()).error ?? t("appointments.actionFailed"));
    load();
  };

  const cancel = async (a: Appointment) => {
    if (!confirm(t("appointments.cancelConfirm"))) return;
    const res = await fetch(`/api/appointments/${a.id}`, { method: "DELETE" });
    if (!res.ok) alert((await res.json()).error ?? t("appointments.actionFailed"));
    load();
  };

  const live = appointments.filter((a) => a.status !== "CANCELLED");
  const booked = live.reduce((s, a) => s + a.totalPrice, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title={t("appointments.title")}
        subtitle={t("appointments.subtitle")}
        action={
          <button onClick={() => setBooking(true)} className="btn-primary">
            <Icon name="plus" /> {t("appointments.new")}
          </button>
        }
      />

      <div className="card p-4 mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">{t("field.date")}</label>
          <DateNavInput value={date} onChange={setDate} />
        </div>
        <div className="ms-auto flex gap-5 text-sm">
          <div>
            <div className="text-xs text-gray-500">{t("appointments.booked")}</div>
            <div className="text-lg font-bold text-gray-900 tabular-nums">{live.length}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">{t("appointments.expectedTakings")}</div>
            <div className="text-lg font-bold text-green-700 tabular-nums">{fmtCurrency(booked)}</div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card h-16 animate-pulse bg-gray-100" />
          ))}
        </div>
      ) : appointments.length === 0 ? (
        <EmptyState icon="📅" title={t("appointments.none")} description={t("appointments.noneHint")} />
      ) : (
        <div className="space-y-2">
          {appointments.map((a) => (
            <div
              key={a.id}
              className={`card p-4 flex flex-wrap items-center gap-3 ${a.status === "CANCELLED" ? "opacity-60" : ""}`}
            >
              <div className="w-16 shrink-0">
                <div className="text-base font-bold text-gray-900 tabular-nums">{fmtTime(a.startAt)}</div>
                <div className="text-[11px] text-gray-400 tabular-nums">{a.durationMinutes} {t("appointments.minutesShort")}</div>
              </div>

              <div className="flex-1 min-w-40">
                <div className="font-semibold text-gray-900">{a.customer.name}</div>
                <div className="text-xs text-gray-500">
                  {a.services.map((s) => s.serviceName).join(", ")}
                  {a.customer.phone && <span className="text-gray-400"> · {a.customer.phone}</span>}
                </div>
              </div>

              <div className="text-sm text-gray-600 min-w-24">
                {a.barber?.name ?? <span className="text-amber-600">{t("appointments.noBarberYet")}</span>}
              </div>

              <Badge variant={APPOINTMENT_BADGE[a.status] ?? "gray"}>{t(appointmentStatusKey(a.status))}</Badge>

              <div className="text-sm font-semibold text-gray-900 tabular-nums w-20 text-end">
                {fmtCurrency(a.totalPrice)}
              </div>

              {a.status !== "CANCELLED" && a.status !== "COMPLETED" && (
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {a.status === "CONFIRMED" && (
                    <button onClick={() => setStatus(a, "CHECKED_IN")} className="btn-ghost px-2 py-1">
                      {t("appointments.checkIn")}
                    </button>
                  )}
                  {a.status === "CHECKED_IN" && (
                    <button onClick={() => setStatus(a, "IN_PROGRESS")} className="btn-ghost px-2 py-1">
                      {t("appointments.start")}
                    </button>
                  )}
                  <button onClick={() => setRescheduling(a)} className="btn-ghost px-2 py-1">
                    {t("appointments.reschedule")}
                  </button>
                  <button onClick={() => setStatus(a, "NO_SHOW")} className="btn-ghost px-2 py-1 text-amber-600">
                    {t("appointments.noShow")}
                  </button>
                  <button onClick={() => cancel(a)} className="btn-ghost px-2 py-1 text-red-500">
                    {t("action.cancel")}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <BookingModal
        open={booking}
        onClose={() => setBooking(false)}
        onBooked={() => { setBooking(false); load(); }}
        date={date}
        services={services}
        barbers={barbers}
        lang={lang}
      />

      {rescheduling && (
        <BookingModal
          open
          onClose={() => setRescheduling(null)}
          onBooked={() => { setRescheduling(null); load(); }}
          date={rescheduling.startAt.slice(0, 10)}
          services={services}
          barbers={barbers}
          lang={lang}
          appointment={rescheduling}
        />
      )}
    </div>
  );
}

/**
 * Book or move an appointment. The times offered come from the server, so what
 * is shown is always what is genuinely free.
 */
function BookingModal({
  open,
  onClose,
  onBooked,
  date,
  services,
  barbers,
  lang,
  appointment,
}: {
  open: boolean;
  onClose: () => void;
  onBooked: () => void;
  date: string;
  services: Service[];
  barbers: Barber[];
  lang: string;
  appointment?: Appointment;
}) {
  const { t, fmtCurrency, fmtTime } = useTranslation();
  const isReschedule = !!appointment;

  const [day, setDay] = useState(date);
  const [serviceIds, setServiceIds] = useState<string[]>(appointment?.services.map((s) => s.serviceId) ?? []);
  const [barberId, setBarberId] = useState<string>(appointment?.barber?.id ?? "");
  const [customer, setCustomer] = useState<Customer | null>(appointment?.customer ?? null);
  const [search, setSearch] = useState("");
  const [found, setFound] = useState<Customer[]>([]);
  const [slots, setSlots] = useState<SlotResponse | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [notes, setNotes] = useState(appointment?.notes ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDay(date);
    setServiceIds(appointment?.services.map((s) => s.serviceId) ?? []);
    setBarberId(appointment?.barber?.id ?? "");
    setCustomer(appointment?.customer ?? null);
    setChosen(null);
    setError("");
  }, [open, date, appointment]);

  useEffect(() => {
    if (!search.trim()) { setFound([]); return; }
    const timer = setTimeout(() => {
      fetch(`/api/customers?search=${encodeURIComponent(search)}`)
        .then((r) => r.json())
        .then((d) => setFound(Array.isArray(d) ? d : []));
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  // Ask the server for free times whenever the choices change.
  useEffect(() => {
    if (!open || serviceIds.length === 0) { setSlots(null); return; }
    const params = new URLSearchParams({ date: day, serviceIds: serviceIds.join(","), ignoreNotice: "1" });
    if (barberId) params.set("barberId", barberId);
    if (appointment) params.set("excludeAppointmentId", appointment.id);
    fetch(`/api/booking/slots?${params}`)
      .then((r) => r.json())
      .then((d) => setSlots(d?.error ? null : d));
  }, [open, day, serviceIds, barberId, appointment]);

  const times = useMemo(() => {
    if (!slots) return [];
    return barberId ? slots.perBarber.find((b) => b.barberId === barberId)?.slots ?? [] : slots.anyBarber;
  }, [slots, barberId]);

  const toggleService = (id: string) =>
    setServiceIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  const save = async () => {
    setError("");
    if (!isReschedule && !customer) { setError(t("appointments.pickCustomer")); return; }
    if (serviceIds.length === 0) { setError(t("appointments.pickService")); return; }
    if (!chosen) { setError(t("appointments.pickTime")); return; }

    setSaving(true);
    try {
      const res = await fetch(isReschedule ? `/api/appointments/${appointment!.id}` : "/api/appointments", {
        method: isReschedule ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isReschedule ? {} : { customerId: customer!.id, source: "PHONE" }),
          barberId: barberId || null,
          startAt: chosen,
          serviceIds,
          notes,
        }),
      });
      if (res.ok) onBooked();
      else setError((await res.json()).error ?? t("appointments.actionFailed"));
    } catch {
      setError(t("appointments.networkError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isReschedule ? t("appointments.reschedule") : t("appointments.new")}>
      <div className="space-y-4">
        {!isReschedule && (
          <div>
            <label className="label">{t("customers.title")}</label>
            {customer ? (
              <div className="flex items-center gap-2">
                <div className="input flex-1 bg-primary-50 border-primary-200 text-primary-800 font-medium truncate">
                  {customer.name}
                  {customer.phone && <span className="text-primary-400 ms-2 font-normal text-xs">{customer.phone}</span>}
                </div>
                <button type="button" onClick={() => setCustomer(null)} className="btn-ghost text-xs px-2 py-2">✕</button>
              </div>
            ) : (
              <>
                <input
                  className="input"
                  placeholder={t("newVisit.selectCustomer")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {found.length > 0 && (
                  <div className="mt-1 border border-gray-200 rounded-lg max-h-40 overflow-y-auto">
                    {found.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { setCustomer(c); setSearch(""); setFound([]); }}
                        className="w-full text-start px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                      >
                        <div className="text-sm font-medium text-gray-900">{c.name}</div>
                        {c.phone && <div className="text-xs text-gray-400">{c.phone}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div>
          <label className="label">{t("field.services")}</label>
          <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto pe-1">
            {services.map((s) => {
              const on = serviceIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleService(s.id)}
                  className={`text-start px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                    on ? "border-primary-400 bg-primary-50 text-primary-700" : "border-gray-200 hover:border-primary-300"
                  }`}
                >
                  <div className="truncate">{lang === "ar" && s.arabicName ? s.arabicName : s.name}</div>
                  <div className="font-normal text-gray-400">
                    {s.durationMinutes} {t("appointments.minutesShort")} · {fmtCurrency(s.defaultPrice)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t("field.barber")}</label>
            <select className="input" value={barberId} onChange={(e) => { setBarberId(e.target.value); setChosen(null); }}>
              <option value="">{t("appointments.anyBarber")}</option>
              {barbers.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{t("field.date")}</label>
            <input type="date" className="input" value={day} onChange={(e) => { setDay(e.target.value); setChosen(null); }} />
          </div>
        </div>

        <div>
          <label className="label">
            {t("appointments.pickTime")}
            {slots && slots.durationMinutes > 0 && (
              <span className="text-gray-400 font-normal ms-2">
                {slots.durationMinutes} {t("appointments.minutesShort")} · {fmtCurrency(slots.price)}
              </span>
            )}
          </label>
          {serviceIds.length === 0 ? (
            <p className="text-xs text-gray-400">{t("appointments.pickServiceFirst")}</p>
          ) : times.length === 0 ? (
            <p className="text-xs text-amber-600">{t("appointments.noTimes")}</p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 max-h-40 overflow-y-auto">
              {times.map((iso) => (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setChosen(iso)}
                  className={`px-2 py-1.5 rounded-lg border text-xs font-medium tabular-nums transition-colors ${
                    chosen === iso ? "border-primary-500 bg-primary-600 text-white" : "border-gray-200 hover:border-primary-300"
                  }`}
                >
                  {fmtTime(iso)}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="label">{t("field.notes")}</label>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("newVisit.notesPlaceholder")} />
        </div>

        {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg border border-red-200">{error}</div>}

        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">{t("action.cancel")}</button>
          <button type="button" onClick={save} disabled={saving} className="btn-primary flex-1">
            {saving ? t("action.saving") : isReschedule ? t("action.save") : t("appointments.confirm")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
