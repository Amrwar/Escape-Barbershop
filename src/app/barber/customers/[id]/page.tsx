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
  cutsWanted: { id: string; image: string; note: string | null }[];
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
      <Link href="/barber" className="inline-flex items-center gap-1 text-sm text-soft transition-colors hover:text-mid">
        ‹ {t("barberApp.backToDay")}
      </Link>

      <section className="c-card-raised animate-fade-up p-5">
        <div className="flex items-center gap-4">
          <Avatar name={file.customer.name} size={52} />
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold">{file.customer.name}</div>
            {file.customer.phone && <div className="text-sm text-soft">{formatPhone(file.customer.phone)}</div>}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-hair pt-4 text-center">
          <div>
            <div className="text-lg font-bold tabular-nums">{file.visitCount}</div>
            <div className="mt-0.5 text-[11px] text-soft">{t("barberApp.visitsWithYou")}</div>
          </div>
          <div>
            <div className="text-lg font-bold tabular-nums">{file.lastVisit ? fmtDate(file.lastVisit) : "—"}</div>
            <div className="mt-0.5 text-[11px] text-soft">{t("barberApp.lastVisit")}</div>
          </div>
          <div>
            <div className="text-lg font-bold tabular-nums text-accent">{fmtCurrency(file.totalSpent)}</div>
            <div className="mt-0.5 text-[11px] text-soft">{t("barberApp.spentWithYou")}</div>
          </div>
        </div>

        {file.usual.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-hair pt-4">
            {file.usual.map((u) => (
              <Pill key={u.name}>
                {u.name} · {u.count}
              </Pill>
            ))}
          </div>
        )}
      </section>

      {(file.cutsWanted?.length ?? 0) > 0 && (
        <section>
          <SectionTitle>{t("wanted.barberTitle")}</SectionTitle>
          <div className="c-card p-4">
            <div className="grid grid-cols-3 gap-2">
              {file.cutsWanted.map((photo) => (
                <div key={photo.id} className="overflow-hidden border border-hair">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.image} alt={photo.note ?? ""} className="aspect-square w-full object-cover" />
                </div>
              ))}
            </div>
            {file.cutsWanted.some((p) => p.note) && (
              <ul className="mt-3 space-y-1 text-xs text-soft">
                {file.cutsWanted
                  .filter((p) => p.note)
                  .map((p) => (
                    <li key={p.id}>· {p.note}</li>
                  ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {file.upcoming.length > 0 && (
        <section>
          <SectionTitle>{t("app.upcoming")}</SectionTitle>
          <div className="c-card space-y-2 p-4">
            {file.upcoming.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-sm">
                <span className="text-mid">
                  {fmtDate(a.startAt)} · {fmtTime(a.startAt)}
                </span>
                <span className="truncate text-soft">{a.services.map((s) => s.serviceName).join(", ")}</span>
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
                <div key={n.id} className="rounded-[3px] bg-surface px-4 py-3">
                  <p className="text-sm text-ink">{n.text}</p>
                  <p className="mt-1 text-[11px] text-faint">
                    {n.barber?.name ?? "—"} · {fmtDate(n.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-center text-xs text-faint">{t("barberApp.noNotes")}</p>
          )}
        </div>
      </section>

      {file.visits.length > 0 && (
        <section>
          <SectionTitle>{t("customers.visitHistory")}</SectionTitle>
          <div className="c-card divide-y divide-hair">
            {file.visits.map((v) => (
              <div key={v.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm text-ink">{fmtDate(v.visitAt)}</div>
                  <div className="truncate text-xs text-soft">
                    {v.items
                      .map((i) => `${lang === "ar" && i.service?.arabicName ? i.service.arabicName : i.service?.name ?? "—"}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`)
                      .join(", ")}
                  </div>
                </div>
                <div className="text-sm font-medium tabular-nums text-ink">{fmtCurrency(v.total)}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
