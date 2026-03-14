"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DateNavInput } from "@/components/ui/DateNavInput";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { useSession } from "next-auth/react";
import { useTranslation } from "@/lib/i18n";
import { format } from "date-fns";

interface Visit {
  id: string;
  visitAt: string;
  paymentMethod: string;
  discount: number;
  total: number;
  customer: { name: string };
  barber: { name: string };
  items: { service: { name: string; arabicName: string | null }; quantity: number; priceAtTime: number }[];
}

interface Barber { id: string; name: string; }

const paymentBadge: Record<string, "green" | "blue" | "yellow"> = {
  CASH: "green", CARD: "blue", MIXED: "yellow",
};

export default function VisitsPage() {
  const { data: session } = useSession();
  const isOwner = session?.user?.role === "OWNER";
  const { t, fmtCurrency, fmtDateTime, lang, fmtCustomerName } = useTranslation();

  const [visits, setVisits] = useState<Visit[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [loading, setLoading] = useState(true);

  const today = format(new Date(), "yyyy-MM-dd");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [barberId, setBarberId] = useState("");

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to + "T23:59:59");
    if (barberId) params.set("barberId", barberId);
    fetch(`/api/visits?${params}`)
      .then((r) => r.json())
      .then((data) => { setVisits(Array.isArray(data) ? data : []); setVisitsPage(1); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    if (isOwner) {
      fetch("/api/barbers?active=true")
        .then((r) => r.json())
        .then((data) => setBarbers(Array.isArray(data) ? data : []));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  const [visitsPage, setVisitsPage] = useState(1);
  const PAGE_SIZE = 15;

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deletePin, setDeletePin] = useState("");
  const [deletePinError, setDeletePinError] = useState("");
  const [deletePinVerifying, setDeletePinVerifying] = useState(false);

  const handleDelete = (id: string) => {
    setDeleteTargetId(id);
    setDeletePin("");
    setDeletePinError("");
    setDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    setDeletePinError("");
    setDeletePinVerifying(true);
    try {
      const res = await fetch("/api/settings/discount-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: deletePin }),
      });
      const data = await res.json();
      if (!data.valid) { setDeletePinError(t("newVisit.wrongPin")); return; }
      setDeleteModal(false);
      setDeletingId(deleteTargetId);
      await fetch(`/api/visits/${deleteTargetId}`, { method: "DELETE" });
      setDeletingId(null);
      load();
    } finally {
      setDeletePinVerifying(false);
    }
  };

  const totalRevenue = visits.reduce((s, v) => s + v.total, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title={t("visits.title")}
        subtitle={`${visits.length} ${t("common.visits")} — ${t("field.total")}: ${fmtCurrency(totalRevenue)}`}
        action={<Link href="/visits/new" className="btn-primary">{t("action.newVisit")}</Link>}
      />

      {/* Filters */}
      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">{t("field.from")}</label>
          <DateNavInput value={from} onChange={setFrom} />
        </div>
        <div>
          <label className="label">{t("field.to")}</label>
          <DateNavInput value={to} onChange={setTo} />
        </div>
        {isOwner && (
          <div>
            <label className="label">{t("field.barber")}</label>
            <select className="input" value={barberId} onChange={(e) => setBarberId(e.target.value)}>
              <option value="">{t("common.allBarbers")}</option>
              {barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}
        <button onClick={load} className="btn-primary">{t("action.filter")}</button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-4 animate-pulse h-20 bg-gray-100" />
          ))}
        </div>
      ) : visits.length === 0 ? (
        <EmptyState icon="📋" title={t("visits.noVisits")} description={t("visits.noVisitsHint")}
          action={<Link href="/visits/new" className="btn-primary">{t("action.newVisit")}</Link>}
        />
      ) : (
        <div className="space-y-3">
          {visits.slice((visitsPage - 1) * PAGE_SIZE, visitsPage * PAGE_SIZE).map((v) => (
            <div key={v.id} className="card p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-semibold text-gray-900">{fmtCustomerName(v.customer.name)}</span>
                    <Badge variant={paymentBadge[v.paymentMethod] ?? "gray"}>
                      {v.paymentMethod === "CASH" ? t("common.cash") : v.paymentMethod === "CARD" ? t("common.card") : t("common.mixed")}
                    </Badge>
                    {isOwner && (
                      <span className="text-xs text-gray-500">{t("common.by")} {v.barber.name}</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{fmtDateTime(v.visitAt)}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {v.items.map((item, idx) => (
                      <span key={idx} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {lang === "ar" && item.service.arabicName ? item.service.arabicName : item.service.name}
                        {item.quantity > 1 && ` ${t("common.x")}${item.quantity}`}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="shrink-0 text-end space-y-1">
                  <div className="text-lg font-bold text-gray-900">{fmtCurrency(v.total)}</div>
                  {v.discount > 0 && (
                    <div className="text-xs text-red-500">-{v.discount}% {t("common.off")}</div>
                  )}
                  <div className="flex gap-2 justify-end pt-1">
                    <Link href={`/visits/${v.id}`} className="text-xs text-gray-500 hover:underline">
                      {t("action.view")}
                    </Link>
                    {isOwner && (
                      <>
                        <Link href={`/visits/${v.id}/edit`} className="text-xs text-primary-600 hover:underline">
                          {t("action.edit")}
                        </Link>
                        <button
                          onClick={() => handleDelete(v.id)}
                          disabled={deletingId === v.id}
                          className="text-xs text-red-500 hover:underline"
                        >
                          {deletingId === v.id ? "…" : t("action.delete")}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
          <Pagination page={visitsPage} totalPages={Math.ceil(visits.length / PAGE_SIZE)} onPage={setVisitsPage} />
        </div>
      )}

      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title={t("action.delete")} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{t("settings.securityPinVerify")}</p>
          <input
            type="password"
            className="input text-center text-xl tracking-widest"
            placeholder="••••"
            value={deletePin}
            onChange={(e) => setDeletePin(e.target.value)}
            autoFocus
            maxLength={20}
          />
          {deletePinError && <p className="text-red-500 text-sm text-center">{deletePinError}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={() => setDeleteModal(false)} className="btn-secondary flex-1">{t("action.cancel")}</button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={deletePinVerifying || !deletePin}
              className="flex-1 py-2 px-4 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deletePinVerifying ? "…" : t("action.delete")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
