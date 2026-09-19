"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import { EmptyState, ScreenTitle, Skeleton } from "@/components/customer/kit";
import { Stars } from "@/components/customer/Stars";

/**
 * One haircut, as a receipt they can keep.
 *
 * The shop could always print or send one from the till; the customer could
 * never get it back afterwards. Same visit, their side of it, and shareable —
 * which for these customers means WhatsApp.
 */

interface Receipt {
  id: string;
  receiptNo: string;
  visitAt: string;
  total: number;
  barber: { name: string } | null;
  rating: number | null;
  services: { name: string | null; arabicName: string | null; quantity: number; price: number }[];
  products: { name: string; quantity: number; total: number }[];
  shop: { name: string; phone: string | null };
}

export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const { t, lang, fmtCurrency, fmtDateTime } = useTranslation();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    fetch(`/api/customer/visits/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d?.id ? setReceipt(d) : setMissing(true)))
      .catch(() => setMissing(true));
  }, [id]);

  const name = (s: Receipt["services"][number]) => (lang === "ar" && s.arabicName ? s.arabicName : s.name) ?? "—";

  const asText = (r: Receipt) => {
    const lines = [
      r.shop.name,
      `${t("history.receiptNo")} ${r.receiptNo}`,
      fmtDateTime(r.visitAt),
      r.barber ? `${t("field.barber")}: ${r.barber.name}` : null,
      "",
      ...r.services.map((s) => `${name(s)}${s.quantity > 1 ? ` ×${s.quantity}` : ""}  ${fmtCurrency(s.price * s.quantity)}`),
      ...r.products.map((p) => `${p.name}${p.quantity > 1 ? ` ×${p.quantity}` : ""}  ${fmtCurrency(p.total)}`),
      "",
      `${t("field.total")}: ${fmtCurrency(r.total)}`,
      r.shop.phone,
    ];
    return lines.filter((l) => l !== null && l !== undefined).join("\n");
  };

  const share = async () => {
    if (!receipt) return;
    const text = asText(receipt);
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
    } catch {
      // They closed the sheet, or the clipboard refused. Nothing to report.
    }
  };

  const whatsapp = () => {
    if (!receipt) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(asText(receipt))}`, "_blank", "noopener");
  };

  if (missing) {
    return (
      <div className="space-y-6">
        <EmptyState icon="scissors" title={t("history.gone")} hint={t("history.goneHint")} />
        <Link href="/app/history" className="c-btn-secondary block w-full text-center">
          {t("history.title")}
        </Link>
      </div>
    );
  }

  if (!receipt) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const subtotal =
    receipt.services.reduce((s, i) => s + i.price * i.quantity, 0) +
    receipt.products.reduce((s, p) => s + p.total, 0);

  return (
    <div className="space-y-6">
      <ScreenTitle title={t("history.receipt")} hint={`${t("history.receiptNo")} ${receipt.receiptNo}`} />

      <article className="c-card-raised p-5">
        <header className="border-b border-hair pb-4 text-center">
          <div className="text-sm font-bold uppercase tracking-[0.24em] text-ink">{receipt.shop.name}</div>
          <div className="mt-1 text-xs text-soft">{fmtDateTime(receipt.visitAt)}</div>
          {receipt.barber && <div className="mt-1 text-xs text-accent">{receipt.barber.name}</div>}
        </header>

        <div className="divide-y divide-hair">
          {receipt.services.map((service, i) => (
            <div key={`s${i}`} className="flex items-baseline justify-between gap-4 py-3">
              <span className="min-w-0 text-sm text-mid">
                {name(service)}
                {service.quantity > 1 && <span className="text-soft"> ×{service.quantity}</span>}
              </span>
              <span className="shrink-0 tabular-nums text-sm text-ink">
                {fmtCurrency(service.price * service.quantity)}
              </span>
            </div>
          ))}
          {receipt.products.map((product, i) => (
            <div key={`p${i}`} className="flex items-baseline justify-between gap-4 py-3">
              <span className="min-w-0 text-sm text-mid">
                {product.name}
                {product.quantity > 1 && <span className="text-soft"> ×{product.quantity}</span>}
              </span>
              <span className="shrink-0 tabular-nums text-sm text-ink">{fmtCurrency(product.total)}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-hair pt-4">
          {/* Shown only when it differs, so nobody hunts for a discount that is
              the shop's business rather than a line on their copy. */}
          {Math.round(subtotal) !== Math.round(receipt.total) && (
            <div className="flex items-baseline justify-between gap-4 pb-2 text-xs text-soft">
              <span>{t("field.subtotal")}</span>
              <span className="tabular-nums">{fmtCurrency(subtotal)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-faint">{t("field.total")}</span>
            <span className="c-display text-2xl leading-none text-accent">{fmtCurrency(receipt.total)}</span>
          </div>
        </div>

        {receipt.rating !== null && (
          <div className="mt-4 flex items-center justify-center gap-2 border-t border-hair pt-4">
            <span className="text-xs text-soft">{t("history.youRated")}</span>
            <Stars rating={receipt.rating} />
          </div>
        )}

        {receipt.shop.phone && (
          <p className="mt-4 text-center text-xs text-faint" dir="ltr">
            {receipt.shop.phone}
          </p>
        )}
      </article>

      <div className="flex gap-2">
        <button type="button" onClick={whatsapp} className="c-btn-primary flex-1">
          {t("history.sendWhatsApp")}
        </button>
        <button type="button" onClick={share} className="c-btn-secondary flex-1">
          {t("history.share")}
        </button>
      </div>

      <Link href="/app/history" className="block text-center text-xs text-soft">
        ← {t("history.title")}
      </Link>
    </div>
  );
}
