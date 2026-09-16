"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import { formatPhone } from "@/lib/customers";
import { Avatar, EmptyState, Pill, SectionTitle, Skeleton } from "@/components/customer/kit";

/**
 * What the barber should know before the customer sits down: how often they
 * come, what they usually have, and what was said last time.
 */

interface CustomerFile {
  customer: { id: string; name: string; phone: string | null };
  visitCount: number;
  lastVisit: string | null;
  totalSpent: number;
  usual: { name: string; count: number }[];
  visits: { id: string; visitAt: string; total: number; items: { quantity: number; service: { name: string; arabicName: string | null } | null }[] }[];
  notes: { id: string; text: string; createdAt: string; barber: { name: string } | null }[];
  upcoming: { id: string; startAt: string; services: { serviceName: string }[] }[];
}

export default function BarberCustomerPage() {
  const { id } = useParams<{ id: string }>();
  const { t, fmtCurrency, fmtDate, fmtTime, lang } = useTranslation();
  const [file, setFile] = useState<CustomerFile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/barber/customers/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setFile)
      .catch(() => setNotFound(true));
  }, [id]);

  useEffect(load, [load]);

  const addNote = async () => {
    if (!note.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/barber/customers/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: note }),
      });
      if (res.ok) {
        setNote("");
        load();
      }
    } finally {
      setSaving(false);
    }
  };

  if (notFound) {
    return (
      <div className="pt-6">
        <EmptyState icon="users" title={t("barberApp.customerNotFound")} hint={t("barberApp.customerNotFoundHint")} />
      </div>
    );
  }
  if (!file) {
    return (
      <div className="space-y-3 pt-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/barber" className="inline-flex items-center gap-1 text-sm text-white/40 transition-colors hover:text-white/70">
        ‹ {t("barberApp.backToDay")}
      </Link>

      <section className="c-card-raised animate-fade-up p-5">
        <div className="flex items-center gap-4">
          <Avatar name={file.customer.name} size={52} />
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold">{file.customer.name}</div>
            {file.customer.phone && <div className="text-sm text-white/45">{formatPhone(file.customer.phone)}</div>}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/10 pt-4 text-center">
          <div>
            <div className="text-lg font-bold tabular-nums">{file.visitCount}</div>
            <div className="mt-0.5 text-[11px] text-white/40">{t("barberApp.visitsWithYou")}</div>
          </div>
          <div>
            <div className="text-lg font-bold tabular-nums">{file.lastVisit ? fmtDate(file.lastVisit) : "—"}</div>
            <div className="mt-0.5 text-[11px] text-white/40">{t("barberApp.lastVisit")}</div>
          </div>
          <div>
            <div className="text-lg font-bold tabular-nums text-brass-300">{fmtCurrency(file.totalSpent)}</div>
            <div className="mt-0.5 text-[11px] text-white/40">{t("barberApp.spentWithYou")}</div>
          </div>
        </div>

        {file.usual.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
            {file.usual.map((u) => (
              <Pill key={u.name}>
                {u.name} · {u.count}
              </Pill>
            ))}
          </div>
        )}
      </section>

      {file.upcoming.length > 0 && (
        <section>
          <SectionTitle>{t("app.upcoming")}</SectionTitle>
          <div className="c-card space-y-2 p-4">
            {file.upcoming.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-sm">
                <span className="text-white/70">
                  {fmtDate(a.startAt)} · {fmtTime(a.startAt)}
                </span>
                <span className="truncate text-white/50">{a.services.map((s) => s.serviceName).join(", ")}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle>{t("barberApp.notes")}</SectionTitle>
        <div className="c-card p-4">
          <div className="flex gap-2">
            <input
              className="c-input flex-1"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("barberApp.notePlaceholder")}
              onKeyDown={(e) => e.key === "Enter" && addNote()}
            />
            <button type="button" onClick={addNote} disabled={saving || !note.trim()} className="c-btn-primary px-4">
              {saving ? "…" : t("action.add")}
            </button>
          </div>

          {file.notes.length > 0 ? (
            <div className="mt-4 space-y-3">
              {file.notes.map((n) => (
                <div key={n.id} className="rounded-xl bg-white/[0.04] px-4 py-3">
                  <p className="text-sm text-white/90">{n.text}</p>
                  <p className="mt-1 text-[11px] text-white/35">
                    {n.barber?.name ?? "—"} · {fmtDate(n.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-center text-xs text-white/30">{t("barberApp.noNotes")}</p>
          )}
        </div>
      </section>

      {file.visits.length > 0 && (
        <section>
          <SectionTitle>{t("customers.visitHistory")}</SectionTitle>
          <div className="c-card divide-y divide-white/10">
            {file.visits.map((v) => (
              <div key={v.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm text-white/80">{fmtDate(v.visitAt)}</div>
                  <div className="truncate text-xs text-white/40">
                    {v.items
                      .map((i) => `${lang === "ar" && i.service?.arabicName ? i.service.arabicName : i.service?.name ?? "—"}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`)
                      .join(", ")}
                  </div>
                </div>
                <div className="text-sm font-medium tabular-nums text-white/80">{fmtCurrency(v.total)}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
