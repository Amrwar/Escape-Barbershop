"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Note } from "@/components/ui/Note";
import { Icon } from "@/components/ui/Icon";
import { useTranslation } from "@/lib/i18n";
import { offerState, savingOf } from "@/lib/offers";

/**
 * What the shop is running. An offer is a notice shown in the customer app —
 * it never changes a price by itself, because the till is the record of what
 * was actually charged.
 */

interface Offer {
  id: string;
  title: string;
  titleAr: string | null;
  description: string | null;
  price: number | null;
  wasPrice: number | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
}

const emptyForm = {
  title: "",
  titleAr: "",
  description: "",
  price: "",
  wasPrice: "",
  startsAt: "",
  endsAt: "",
  isActive: true,
};

const STATE_BADGE = { running: "green", scheduled: "blue", finished: "gray", off: "gray" } as const;
const STATE_KEY = {
  running: "offers.live",
  scheduled: "offers.scheduled",
  finished: "offers.finished",
  off: "offers.off",
} as const;

export default function OffersPage() {
  const { t, fmtCurrency, fmtDate } = useTranslation();
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [editing, setEditing] = useState<Offer | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    fetch("/api/offers")
      .then((r) => r.json())
      .then((d) => setOffers(Array.isArray(d) ? d : []))
      .catch(() => setOffers([]));
  }, []);

  useEffect(load, [load]);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setOpen(true);
  };

  const openEdit = (offer: Offer) => {
    setEditing(offer);
    setForm({
      title: offer.title,
      titleAr: offer.titleAr ?? "",
      description: offer.description ?? "",
      price: offer.price?.toString() ?? "",
      wasPrice: offer.wasPrice?.toString() ?? "",
      startsAt: offer.startsAt?.slice(0, 10) ?? "",
      endsAt: offer.endsAt?.slice(0, 10) ?? "",
      isActive: offer.isActive,
    });
    setError("");
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) {
      setError(t("offers.name"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body = {
        title: form.title,
        titleAr: form.titleAr,
        description: form.description,
        price: form.price === "" ? null : parseFloat(form.price),
        wasPrice: form.wasPrice === "" ? null : parseFloat(form.wasPrice),
        startsAt: form.startsAt ? new Date(`${form.startsAt}T00:00:00`).toISOString() : "",
        endsAt: form.endsAt ? new Date(`${form.endsAt}T23:59:59`).toISOString() : "",
        isActive: form.isActive,
      };
      const res = await fetch(editing ? `/api/offers/${editing.id}` : "/api/offers", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setOpen(false);
        load();
      } else {
        setError((await res.json()).error ?? t("appointments.actionFailed"));
      }
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (offer: Offer) => {
    await fetch(`/api/offers/${offer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !offer.isActive }),
    });
    load();
  };

  const remove = async (offer: Offer) => {
    if (!confirm(t("offers.deleteConfirm"))) return;
    await fetch(`/api/offers/${offer.id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <PageHeader
        title={t("offers.title")}
        subtitle={t("offers.subtitle")}
        action={
          <button onClick={openNew} className="btn-primary">
            <Icon name="plus" /> {t("offers.new")}
          </button>
        }
      />

      <div className="mb-5">
        <Note tone="info" title={t("offers.title")} icon="receipt">
          {t("offers.notEnforced")}
        </Note>
      </div>

      {offers === null ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="card h-24 animate-pulse bg-gray-100" />
          ))}
        </div>
      ) : offers.length === 0 ? (
        <EmptyState icon="🏷️" title={t("offers.none")} description={t("offers.noneHint")} />
      ) : (
        <div className="space-y-2">
          {offers.map((offer) => {
            const state = offerState(offer);
            const saving = savingOf(offer);
            return (
              <div key={offer.id} className="card p-4 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-48">
                  <div className="font-semibold text-gray-900">{offer.title}</div>
                  {offer.description && <div className="text-xs text-gray-500 mt-0.5">{offer.description}</div>}
                  {(offer.startsAt || offer.endsAt) && (
                    <div className="text-[11px] text-gray-400 mt-1">
                      {offer.startsAt ? fmtDate(offer.startsAt) : "—"} → {offer.endsAt ? fmtDate(offer.endsAt) : "—"}
                    </div>
                  )}
                </div>

                {offer.price !== null && (
                  <div className="text-end">
                    <div className="font-bold text-gray-900 tabular-nums">{fmtCurrency(offer.price)}</div>
                    {offer.wasPrice !== null && (
                      <div className="text-xs text-gray-400 line-through tabular-nums">{fmtCurrency(offer.wasPrice)}</div>
                    )}
                  </div>
                )}
                {saving !== null && <Badge variant="green">-{fmtCurrency(saving)}</Badge>}
                <Badge variant={STATE_BADGE[state]}>{t(STATE_KEY[state])}</Badge>

                <div className="flex gap-1.5 text-xs">
                  <button onClick={() => openEdit(offer)} className="btn-ghost px-2 py-1">
                    {t("action.edit")}
                  </button>
                  <button onClick={() => toggle(offer)} className="btn-ghost px-2 py-1">
                    {offer.isActive ? t("action.deactivate") : t("action.activate")}
                  </button>
                  <button onClick={() => remove(offer)} className="btn-ghost px-2 py-1 text-red-500">
                    {t("action.delete")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? t("action.edit") : t("offers.new")}>
        <div className="space-y-4">
          <div>
            <label className="label">{t("offers.name")}</label>
            <input
              className="input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={t("offers.namePlaceholder")}
            />
          </div>
          <div>
            <label className="label">{t("offers.nameAr")}</label>
            <input className="input" dir="rtl" value={form.titleAr} onChange={(e) => setForm({ ...form, titleAr: e.target.value })} />
          </div>
          <div>
            <label className="label">{t("field.notes")}</label>
            <input
              className="input"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={t("offers.descriptionPlaceholder")}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t("offers.price")}</label>
              <input
                type="number"
                min="0"
                step="1"
                className="input"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </div>
            <div>
              <label className="label">{t("offers.wasPrice")}</label>
              <input
                type="number"
                min="0"
                step="1"
                className="input"
                value={form.wasPrice}
                onChange={(e) => setForm({ ...form, wasPrice: e.target.value })}
              />
            </div>
            <div>
              <label className="label">{t("offers.startsAt")}</label>
              <input type="date" className="input" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
            </div>
            <div>
              <label className="label">{t("offers.endsAt")}</label>
              <input type="date" className="input" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
            </div>
          </div>

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="rounded border-gray-300 text-primary-600"
            />
            <span className="text-sm text-gray-700">{t("offers.showInApp")}</span>
          </label>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <div className="flex gap-3">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary flex-1">
              {t("action.cancel")}
            </button>
            <button type="button" onClick={save} disabled={saving} className="btn-primary flex-1">
              {saving ? t("action.saving") : t("action.save")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
