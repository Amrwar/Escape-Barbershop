"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/Icon";
import { useTranslation } from "@/lib/i18n";

/**
 * The floor, right now. Three bands, in the order the counter cares about:
 * who is in a chair, who is waiting, and who is still expected today.
 * It refreshes itself, because nobody taps reload with a queue at the door.
 */

interface QueueAppointment {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  source: string;
  durationMinutes: number;
  totalPrice: number;
  customer: { id: string; name: string; phone: string | null };
  barber: { id: string; name: string } | null;
  services: { id: string; serviceId: string; serviceName: string }[];
}

interface Queue {
  inChair: QueueAppointment[];
  waiting: { appointment: QueueAppointment; waitMinutes: number; position: number }[];
  expected: QueueAppointment[];
  barbers: { id: string; name: string }[];
}

interface Service { id: string; name: string; arabicName: string | null; defaultPrice: number; durationMinutes: number; isActive: boolean }
interface Customer { id: string; name: string; phone: string | null }

export default function QueuePage() {
  const { t, fmtTime, fmtCurrency, lang } = useTranslation();
  const [queue, setQueue] = useState<Queue | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    fetch("/api/queue")
      .then((r) => r.json())
      .then((d) => setQueue(d?.error ? null : d))
      .catch(() => setQueue(null));
  }, []);

  useEffect(() => {
    load();
    fetch("/api/services?active=true")
      .then((r) => r.json())
      .then((d) => setServices(Array.isArray(d) ? d.filter((s: Service) => s.isActive) : []));
    // The counter leaves this open all day.
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  const act = async (id: string, body: Record<string, unknown>) => {
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/queue/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) setError((await res.json()).error ?? t("appointments.actionFailed"));
      load();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm(t("queue.removeConfirm"))) return;
    setBusyId(id);
    try {
      await fetch(`/api/queue/${id}`, { method: "DELETE" });
      load();
    } finally {
      setBusyId(null);
    }
  };

  if (!queue) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card h-20 animate-pulse bg-gray-100" />
        ))}
      </div>
    );
  }

  const nothingOn = queue.inChair.length === 0 && queue.waiting.length === 0 && queue.expected.length === 0;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeader
        title={t("queue.title")}
        subtitle={t("queue.subtitle")}
        action={
          <button onClick={() => setAdding(true)} className="btn-primary">
            <Icon name="plus" /> {t("queue.addWalkIn")}
          </button>
        }
      />

      {error && <div className="mb-4 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">{error}</div>}

      {nothingOn && (
        <div className="card p-8 text-center">
          <div className="text-3xl mb-2">💈</div>
          <p className="text-sm text-gray-500">{t("queue.empty")}</p>
        </div>
      )}

      {queue.inChair.length > 0 && (
        <Band title={t("queue.inChair")} tone="green">
          {queue.inChair.map((a) => (
            <Row key={a.id} appointment={a} lang={lang}>
              <span className="text-xs text-gray-500 tabular-nums">
                {t("queue.until")} {fmtTime(a.endAt)}
              </span>
              <Link href={`/visits/new?appointmentId=${a.id}`} className="btn-primary px-3 py-1.5 text-xs">
                {t("appointments.ringUp")}
              </Link>
            </Row>
          ))}
        </Band>
      )}

      {queue.waiting.length > 0 && (
        <Band title={t("queue.waiting")} tone="amber">
          {queue.waiting.map(({ appointment: a, waitMinutes, position }) => (
            <Row key={a.id} appointment={a} lang={lang} position={position}>
              <span className="text-xs text-amber-700 tabular-nums whitespace-nowrap">
                ~{waitMinutes} {t("appointments.minutesShort")}
              </span>
              <select
                className="input py-1 text-xs w-32"
                value={a.barber?.id ?? ""}
                onChange={(e) => act(a.id, { barberId: e.target.value || null })}
                disabled={busyId === a.id}
              >
                <option value="">{t("appointments.anyBarber")}</option>
                {queue.barbers.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <button
                onClick={() => act(a.id, { start: true })}
                disabled={busyId === a.id || !a.barber}
                className="btn-primary px-3 py-1.5 text-xs disabled:opacity-40"
                title={a.barber ? undefined : t("queue.chooseBarberFirst")}
              >
                {t("queue.seat")}
              </button>
              <button onClick={() => remove(a.id)} className="btn-ghost px-2 py-1 text-xs text-red-500">
                {t("queue.remove")}
              </button>
            </Row>
          ))}
        </Band>
      )}

      {queue.expected.length > 0 && (
        <Band title={t("queue.expected")} tone="gray">
          {queue.expected.map((a) => (
            <Row key={a.id} appointment={a} lang={lang}>
              <span className="text-xs text-gray-500 tabular-nums">{fmtTime(a.startAt)}</span>
              <button
                onClick={() => act(a.id, {})}
                disabled={busyId === a.id}
                className="btn-secondary px-3 py-1.5 text-xs"
                onClickCapture={() => undefined}
              >
                {fmtCurrency(a.totalPrice)}
              </button>
            </Row>
          ))}
        </Band>
      )}

      <WalkInModal
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={() => { setAdding(false); load(); }}
        services={services}
        barbers={queue.barbers}
        lang={lang}
      />
    </div>
  );
}

function Band({ title, tone, children }: { title: string; tone: "green" | "amber" | "gray"; children: React.ReactNode }) {
  const heading = { green: "text-green-700", amber: "text-amber-700", gray: "text-gray-500" }[tone];
  return (
    <section className="mb-6">
      <h2 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${heading}`}>{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({
  appointment,
  position,
  lang,
  children,
}: {
  appointment: QueueAppointment;
  position?: number;
  lang: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-4 flex flex-wrap items-center gap-3">
      {position !== undefined && (
        <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-800 text-xs font-bold flex items-center justify-center shrink-0">
          {position}
        </div>
      )}
      <div className="flex-1 min-w-40">
        <div className="font-semibold text-gray-900">{appointment.customer.name}</div>
        <div className="text-xs text-gray-500">
          {appointment.services.map((s) => s.serviceName).join(", ")}
          {appointment.barber && <span className="text-gray-400"> · {appointment.barber.name}</span>}
          {appointment.source === "WALK_IN" && <span className="text-gray-400"> · {lang === "ar" ? "بدون حجز" : "walk-in"}</span>}
        </div>
      </div>
      {children}
    </div>
  );
}

/** Someone at the door: who they are, what they want, and who with. */
function WalkInModal({
  open,
  onClose,
  onAdded,
  services,
  barbers,
  lang,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
  services: Service[];
  barbers: { id: string; name: string }[];
  lang: string;
}) {
  const { t, fmtCurrency } = useTranslation();
  const [search, setSearch] = useState("");
  const [found, setFound] = useState<Customer[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [barberId, setBarberId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) { setCustomer(null); setServiceIds([]); setBarberId(""); setSearch(""); setError(""); }
  }, [open]);

  useEffect(() => {
    if (!search.trim()) { setFound([]); return; }
    const timer = setTimeout(() => {
      fetch(`/api/customers?search=${encodeURIComponent(search)}`)
        .then((r) => r.json())
        .then((d) => setFound(Array.isArray(d) ? d : []));
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  /** Nobody wants to type a name with a queue at the door. */
  const useWalkInCustomer = async () => {
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "", phone: "" }),
    });
    setCustomer(await res.json());
  };

  const save = async () => {
    setError("");
    if (!customer) { setError(t("appointments.pickCustomer")); return; }
    if (serviceIds.length === 0) { setError(t("appointments.pickService")); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: customer.id, barberId: barberId || null, serviceIds }),
      });
      if (res.ok) onAdded();
      else setError((await res.json()).error ?? t("appointments.actionFailed"));
    } catch {
      setError(t("appointments.networkError"));
    } finally {
      setSaving(false);
    }
  };

  const total = services.filter((s) => serviceIds.includes(s.id)).reduce((sum, s) => sum + s.defaultPrice, 0);

  return (
    <Modal open={open} onClose={onClose} title={t("queue.addWalkIn")}>
      <div className="space-y-4">
        <div>
          <label className="label">{t("customers.title")}</label>
          {customer ? (
            <div className="flex items-center gap-2">
              <div className="input flex-1 bg-primary-50 border-primary-200 text-primary-800 font-medium truncate">{customer.name}</div>
              <button type="button" onClick={() => setCustomer(null)} className="btn-ghost text-xs px-2 py-2">✕</button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <input className="input flex-1" placeholder={t("newVisit.selectCustomer")} value={search} onChange={(e) => setSearch(e.target.value)} />
                <button type="button" onClick={useWalkInCustomer} className="btn-secondary text-xs whitespace-nowrap">
                  {t("newVisit.walkIn")}
                </button>
              </div>
              {found.length > 0 && (
                <div className="mt-1 border border-gray-200 rounded-lg max-h-36 overflow-y-auto">
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

        <div>
          <label className="label">{t("field.services")}</label>
          <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto pe-1">
            {services.map((s) => {
              const on = serviceIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setServiceIds((prev) => (on ? prev.filter((x) => x !== s.id) : [...prev, s.id]))}
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

        <div>
          <label className="label">{t("field.barber")}</label>
          <select className="input" value={barberId} onChange={(e) => setBarberId(e.target.value)}>
            <option value="">{t("queue.nextFree")}</option>
            {barbers.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg border border-red-200">{error}</div>}

        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">{t("action.cancel")}</button>
          <button type="button" onClick={save} disabled={saving} className="btn-primary flex-1">
            {saving ? t("action.saving") : `${t("queue.addToQueue")}${total > 0 ? ` — ${fmtCurrency(total)}` : ""}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
