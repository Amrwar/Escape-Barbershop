"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { useTranslation } from "@/lib/i18n";
import { Pagination } from "@/components/ui/Pagination";

interface VisitItem {
  id: string;
  quantity: number;
  priceAtTime: number;
  service: { name: string };
}

interface Visit {
  id: string;
  visitAt: string;
  paymentMethod: string;
  discount: number;
  total: number;
  notes: string | null;
  barber: { name: string };
  items: VisitItem[];
}

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  createdAt: string;
  visits: Visit[];
}

const paymentBadge: Record<string, "green" | "blue" | "yellow"> = {
  CASH: "green", CARD: "blue", MIXED: "yellow",
};

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t, fmtCurrency, fmtDate, fmtDateTime, dir, fmtCustomerName } = useTranslation();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [visitsPage, setVisitsPage] = useState(1);
  const PAGE_SIZE = 15;

  useEffect(() => {
    fetch(`/api/customers/${id}`)
      .then((r) => { if (!r.ok) router.push("/customers"); return r.json(); })
      .then(setCustomer)
      .finally(() => setLoading(false));
  }, [id, router]);

  if (loading) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-100 rounded w-1/3" />
          <div className="h-4 bg-gray-100 rounded w-1/4" />
        </div>
      </div>
    );
  }

  if (!customer) return null;

  const totalSpent = customer.visits.reduce((s, v) => s + v.total, 0);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-4">
        <Link href="/customers" className="text-sm text-gray-500 hover:text-gray-700">
          {t("action.back")} {t("customers.title")}
        </Link>
      </div>

      <PageHeader
        title={fmtCustomerName(customer.name)}
        subtitle={`${t("customers.since")} ${fmtDate(customer.createdAt)}`}
        action={
          <Link href={`/visits/new?customerId=${customer.id}`} className="btn-primary">
            {t("action.newVisit")}
          </Link>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <p className="text-xs text-gray-500">{t("field.phone")}</p>
          <p className="font-medium text-gray-900 mt-0.5">{customer.phone ?? "—"}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500">{t("customers.totalVisits")}</p>
          <p className="font-medium text-gray-900 mt-0.5">{customer.visits.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500">{t("customers.totalSpent")}</p>
          <p className="font-medium text-gray-900 mt-0.5">{fmtCurrency(totalSpent)}</p>
        </div>
      </div>

      {customer.notes && (
        <div className="card p-4 mb-6">
          <p className="text-xs text-gray-500 mb-1">{t("field.notes")}</p>
          <p className="text-sm text-gray-700">{customer.notes}</p>
        </div>
      )}

      <h2 className="text-sm font-semibold text-gray-900 mb-3">{t("customers.visitHistory")}</h2>

      {customer.visits.length === 0 ? (
        <EmptyState
          icon="📋"
          title={t("customers.noVisits")}
          action={
            <Link href={`/visits/new?customerId=${customer.id}`} className="btn-primary">
              {t("action.recordFirst")}
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {customer.visits.slice((visitsPage - 1) * PAGE_SIZE, visitsPage * PAGE_SIZE).map((v) => (

            <div key={v.id} className="card p-4">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <div className="font-medium text-gray-900">{fmtDateTime(v.visitAt)}</div>
                  <div className="text-xs text-gray-500">{t("common.barber")}: {v.barber?.name ?? "—"}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={paymentBadge[v.paymentMethod] ?? "gray"}>
                    {v.paymentMethod === "CASH" ? t("common.cash") : v.paymentMethod === "CARD" ? t("common.card") : t("common.mixed")}
                  </Badge>
                  <span className="font-bold text-gray-900">{fmtCurrency(v.total)}</span>
                </div>
              </div>
              <div className="space-y-1">
                {v.items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="text-gray-600">
                      {item.service.name}
                      {item.quantity > 1 && <span className="text-gray-400"> {t("common.x")}{item.quantity}</span>}
                    </span>
                    <span className="text-gray-700">{fmtCurrency(item.priceAtTime * item.quantity)}</span>
                  </div>
                ))}
              </div>
              {v.discount > 0 && (
                <div className="flex justify-between text-sm mt-2 pt-2 border-t border-gray-100">
                  <span className="text-gray-500">{t("field.discount")} ({v.discount}%)</span>
                  <span className="text-red-500">
                    -{fmtCurrency(
                      (v.items.reduce((s, i) => s + i.priceAtTime * i.quantity, 0) * v.discount) / 100
                    )}
                  </span>
                </div>
              )}
              {v.notes && <p className="text-xs text-gray-400 mt-2 italic">{v.notes}</p>}
            </div>
          ))}
          <Pagination page={visitsPage} totalPages={Math.ceil(customer.visits.length / PAGE_SIZE)} onPage={setVisitsPage} />
        </div>
      )}
    </div>
  );
}
