"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { useTranslation } from "@/lib/i18n";
import { printReceipt, buildWhatsAppText, downloadReceiptPdf, type ReceiptVisit, type ReceiptShopSettings } from "@/lib/receipt";

interface VisitDetail {
  id: string;
  visitAt: string;
  paymentMethod: "CASH" | "CARD" | "MIXED";
  discount: number;
  total: number;
  cashAmount: number | null;
  cardAmount: number | null;
  notes: string | null;
  sessionSequence: number | null;
  customer: { name: string; phone: string | null };
  barber: { name: string };
  items: {
    id: string;
    service: { name: string; arabicName: string | null };
    quantity: number;
    priceAtTime: number;
  }[];
}

const paymentBadge: Record<string, "green" | "blue" | "yellow"> = {
  CASH: "green",
  CARD: "blue",
  MIXED: "yellow",
};

export default function VisitDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const isOwner = session?.user?.role === "OWNER";
  const { t, fmtCurrency, fmtDateTime, lang } = useTranslation();

  const [visit, setVisit] = useState<VisitDetail | null>(null);
  const [shopSettings, setShopSettings] = useState<ReceiptShopSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [printModal, setPrintModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/visits/${id}`).then((r) => r.json()),
      fetch("/api/settings/receipt").then((r) => r.json()),
    ]).then(([visitData, settingsData]) => {
      setVisit(visitData);
      setShopSettings(settingsData);
    }).finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    if (!confirm(t("action.delete") + "?")) return;
    setDeleting(true);
    await fetch(`/api/visits/${id}`, { method: "DELETE" });
    router.push("/visits");
  };

  const handleWhatsApp = () => {
    if (!visit || !shopSettings) return;
    const receiptVisit: ReceiptVisit = {
      id: visit.id, visitAt: visit.visitAt, customer: visit.customer, barber: visit.barber,
      paymentMethod: visit.paymentMethod, cashAmount: visit.cashAmount, cardAmount: visit.cardAmount,
      discount: visit.discount, total: visit.total, notes: visit.notes,
      sessionSequence: visit.sessionSequence, items: visit.items,
    };
    const text = buildWhatsAppText(receiptVisit, shopSettings);
    const phone = visit.customer.phone!.replace(/\D/g, "");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank");
  };

  const handleDownloadPdf = async () => {
    if (!visit || !shopSettings) return;
    setDownloadingPdf(true);
    try {
      const receiptVisit: ReceiptVisit = {
        id: visit.id, visitAt: visit.visitAt, customer: visit.customer, barber: visit.barber,
        paymentMethod: visit.paymentMethod, cashAmount: visit.cashAmount, cardAmount: visit.cardAmount,
        discount: visit.discount, total: visit.total, notes: visit.notes,
        sessionSequence: visit.sessionSequence, items: visit.items,
      };
      await downloadReceiptPdf(receiptVisit, shopSettings);
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handlePrint = (mode: "full" | "per-service") => {
    if (!visit || !shopSettings) return;
    const receiptVisit: ReceiptVisit = {
      id: visit.id,
      visitAt: visit.visitAt,
      customer: visit.customer,
      barber: visit.barber,
      paymentMethod: visit.paymentMethod,
      cashAmount: visit.cashAmount,
      cardAmount: visit.cardAmount,
      discount: visit.discount,
      total: visit.total,
      notes: visit.notes,
      sessionSequence: visit.sessionSequence,
      items: visit.items,
    };
    printReceipt(receiptVisit, shopSettings, mode);
    setPrintModal(false);
  };

  if (loading) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-100 rounded w-1/3" />
          <div className="h-64 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  if (!visit) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-gray-500">Visit not found.</p>
        <Link href="/visits" className="text-primary-600 hover:underline text-sm mt-2 inline-block">
          ← {t("visits.title")}
        </Link>
      </div>
    );
  }

  const subtotal = visit.items.reduce((s, i) => s + i.priceAtTime * i.quantity, 0);
  const discountAmount = (subtotal * visit.discount) / 100;
  const receiptNo = visit.sessionSequence != null
    ? String(visit.sessionSequence)
    : visit.id.slice(-8).toUpperCase();

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <Link href="/visits" className="text-sm text-gray-500 hover:text-gray-700">
          ← {t("visits.title")}
        </Link>
        <div className="flex gap-2">
          {isOwner && (
            <>
              <Link href={`/visits/${id}/edit`} className="btn-secondary text-sm">
                {t("action.edit")}
              </Link>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-sm text-red-500 hover:text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
              >
                {deleting ? "…" : t("action.delete")}
              </button>
            </>
          )}
          {visit.customer.phone && (
            <button
              onClick={handleWhatsApp}
              className="btn-secondary text-sm"
            >
              💬 {t("visit.whatsapp")}
            </button>
          )}
          {isOwner && (
            <button
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              className="btn-secondary text-sm"
            >
              {downloadingPdf ? "…" : `⬇ ${t("visit.downloadPdf")}`}
            </button>
          )}
          <button
            onClick={() => setPrintModal(true)}
            className="btn-primary text-sm"
          >
            🖨 {t("visit.printReceipt")}
          </button>
        </div>
      </div>

      <PageHeader title={t("visit.title")} subtitle={`${t("visit.receiptNo")} ${receiptNo}`} />

      {/* Visit Info */}
      <div className="card p-5 mb-4 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="label mb-0.5">{t("field.dateTime")}</div>
            <div className="font-medium text-gray-900">{fmtDateTime(visit.visitAt)}</div>
          </div>
          <div>
            <div className="label mb-0.5">{t("field.barber")}</div>
            <div className="font-medium text-gray-900">{visit.barber.name}</div>
          </div>
          <div>
            <div className="label mb-0.5">{t("customers.title")}</div>
            <div className="font-medium text-gray-900">{visit.customer.name}</div>
            {visit.customer.phone && (
              <div className="text-xs text-gray-400">{visit.customer.phone}</div>
            )}
          </div>
          <div>
            <div className="label mb-0.5">{t("field.paymentMethod")}</div>
            <Badge variant={paymentBadge[visit.paymentMethod] ?? "gray"}>
              {visit.paymentMethod === "CASH"
                ? t("common.cash")
                : visit.paymentMethod === "CARD"
                ? t("common.card")
                : t("common.mixed")}
            </Badge>
            {visit.paymentMethod === "MIXED" && (
              <div className="text-xs text-gray-500 mt-1">
                {t("common.cash")}: {fmtCurrency(visit.cashAmount ?? 0)}<br />
                {t("common.card")}: {fmtCurrency(visit.cardAmount ?? 0)}
              </div>
            )}
          </div>
        </div>

        {visit.notes && (
          <div className="pt-2 border-t border-gray-100 text-sm text-gray-600">
            <span className="font-medium">{t("field.notes")}:</span> {visit.notes}
          </div>
        )}
      </div>

      {/* Items Table */}
      <div className="card overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="th-start px-4 py-3 font-medium text-gray-600">{t("field.service")}</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">{t("field.quantity")}</th>
              <th className="text-end px-4 py-3 font-medium text-gray-600">{t("field.price")}</th>
              <th className="text-end px-4 py-3 font-medium text-gray-600">{t("field.line")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visit.items.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-3 text-gray-900">
                  {lang === "ar" && item.service.arabicName
                    ? item.service.arabicName
                    : item.service.name}
                </td>
                <td className="px-4 py-3 text-center text-gray-600">{item.quantity}</td>
                <td className="px-4 py-3 text-end text-gray-600">{fmtCurrency(item.priceAtTime)}</td>
                <td className="px-4 py-3 text-end font-medium text-gray-900">
                  {fmtCurrency(item.priceAtTime * item.quantity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="border-t border-gray-200 px-4 py-3 space-y-1 bg-gray-50">
          <div className="flex justify-between text-sm text-gray-600">
            <span>{t("field.subtotal")}</span>
            <span>{fmtCurrency(subtotal)}</span>
          </div>
          {visit.discount > 0 && (
            <div className="flex justify-between text-sm text-red-500">
              <span>{t("field.discount")} ({visit.discount}%)</span>
              <span>-{fmtCurrency(discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-gray-900 pt-1 border-t border-gray-200 mt-1">
            <span>{t("field.total")}</span>
            <span>{fmtCurrency(visit.total)}</span>
          </div>
        </div>
      </div>

      {/* Print Modal */}
      <Modal
        open={printModal}
        onClose={() => setPrintModal(false)}
        title={t("visit.printOptions")}
        size="sm"
      >
        <div className="space-y-3 pt-1">
          <p className="text-sm text-gray-500">
            {visit.items.length > 1
              ? `${visit.items.length} services — choose print mode`
              : "Print receipt for this visit"}
          </p>
          <button
            onClick={() => handlePrint("full")}
            className="btn-primary w-full"
          >
            🖨 {t("visit.printFull")}
          </button>
          {visit.items.length > 1 && (
            <button
              onClick={() => handlePrint("per-service")}
              className="btn-secondary w-full"
            >
              📄 {t("visit.printPerService")}
            </button>
          )}
        </div>
      </Modal>
    </div>
  );
}
