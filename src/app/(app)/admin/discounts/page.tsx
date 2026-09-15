"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { format, startOfMonth } from "date-fns";
import { DateNavInput } from "@/components/ui/DateNavInput";
import { PageHeader } from "@/components/ui/PageHeader";
import { Note } from "@/components/ui/Note";
import { Badge } from "@/components/ui/Badge";
import { ExportButton } from "@/components/ui/ExportButton";
import { useTranslation } from "@/lib/i18n";
import { paymentMethodKey } from "@/lib/payments";

interface DiscountItem {
  name: string;
  arabicName: string | null;
  quantity: number;
  price: number;
  lineTotal: number;
}

interface DiscountRow {
  id: string;
  visitAt: string;
  receiptNo: number | null;
  customerName: string;
  barberName: string | null;
  recordedBy: string | null;
  paymentMethod: string;
  discountPercent: number;
  subtotal: number;
  discountAmount: number;
  total: number;
  notes: string | null;
  items: DiscountItem[];
}

interface Summary {
  discountedVisits: number;
  totalVisits: number;
  discountTotal: number;
  subtotalTotal: number;
  periodRevenue: number;
  averagePercent: number;
  shareOfRevenue: number;
}

interface PerBarber {
  barberName: string;
  count: number;
  amount: number;
}

export default function DiscountsPage() {
  const { t, fmtCurrency, fmtDate, fmtDateTime, fmtNumber, fmtCustomerName, lang } = useTranslation();
  const today = format(new Date(), "yyyy-MM-dd");

  const [from, setFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<DiscountRow[]>([]);
  const [perBarber, setPerBarber] = useState<PerBarber[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      from: new Date(from).toISOString(),
      to: new Date(to + "T23:59:59").toISOString(),
    });
    fetch(`/api/discounts?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setRows(Array.isArray(d.rows) ? d.rows : []);
        setPerBarber(Array.isArray(d.perBarber) ? d.perBarber : []);
        setSummary(d.summary ?? null);
      })
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const serviceName = (i: DiscountItem) => (lang === "ar" && i.arabicName ? i.arabicName : i.name);
  const payLabel = (m: string) => t(paymentMethodKey(m));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title={t("discounts.title")}
        subtitle={t("discounts.subtitle")}
        action={
          <ExportButton
            filename={`discounts-${from}-to-${to}.xlsx`}
            disabled={rows.length === 0}
            build={() => [
              {
                name: t("discounts.title"),
                rows: rows.map((r) => ({
                  [t("field.dateTime")]: fmtDateTime(r.visitAt),
                  [t("visit.receiptNo")]: r.receiptNo ?? "",
                  [t("field.name")]: fmtCustomerName(r.customerName),
                  [t("field.barber")]: r.barberName ?? "",
                  [t("discounts.recordedBy")]: r.recordedBy ?? "",
                  [t("field.services")]: r.items
                    .map((i) => `${serviceName(i)}${i.quantity > 1 ? ` x${i.quantity}` : ""}`)
                    .join(", "),
                  [t("field.paymentMethod")]: payLabel(r.paymentMethod),
                  [t("field.subtotal")]: r.subtotal,
                  [t("newVisit.discountPercent")]: r.discountPercent,
                  [t("discounts.amount")]: r.discountAmount,
                  [t("field.total")]: r.total,
                  [t("field.notes")]: r.notes ?? "",
                })),
              },
              {
                name: t("field.services"),
                rows: rows.flatMap((r) =>
                  r.items.map((i) => ({
                    [t("field.dateTime")]: fmtDateTime(r.visitAt),
                    [t("visit.receiptNo")]: r.receiptNo ?? "",
                    [t("field.service")]: serviceName(i),
                    [t("field.quantity")]: i.quantity,
                    [t("field.price")]: i.price,
                    [t("field.total")]: i.lineTotal,
                    [t("newVisit.discountPercent")]: r.discountPercent,
                  }))
                ),
              },
              {
                name: t("reports.perBarber"),
                rows: perBarber.map((b) => ({
                  [t("field.barber")]: b.barberName,
                  [t("discounts.count")]: b.count,
                  [t("discounts.amount")]: b.amount,
                })),
              },
            ]}
          />
        }
      />

      <Note tone="info" title={t("discounts.noteTitle")} icon="banknote">
        {t("discounts.noteBody")}
      </Note>

      {/* Filter */}
      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">{t("field.from")}</label>
          <DateNavInput value={from} onChange={setFrom} />
        </div>
        <div>
          <label className="label">{t("field.to")}</label>
          <DateNavInput value={to} onChange={setTo} />
        </div>
        <button onClick={load} className="btn-primary">{t("action.filter")}</button>
      </div>

      {/* What the discounts cost */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-4">
          <div className="text-xs text-gray-500">{t("discounts.totalGiven")}</div>
          <div className="text-xl font-bold text-red-600 tabular-nums">
            {fmtCurrency(summary?.discountTotal ?? 0)}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-500">{t("discounts.discountedVisits")}</div>
          <div className="text-xl font-bold text-gray-900 tabular-nums">
            {summary?.discountedVisits ?? 0}
            <span className="text-xs font-normal text-gray-400"> / {summary?.totalVisits ?? 0}</span>
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-500">{t("discounts.averagePercent")}</div>
          <div className="text-xl font-bold text-gray-900 tabular-nums">
            {fmtNumber(summary?.averagePercent ?? 0)}%
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-500">{t("discounts.shareOfRevenue")}</div>
          <div className="text-xl font-bold text-amber-700 tabular-nums">
            {fmtNumber(summary?.shareOfRevenue ?? 0)}%
          </div>
        </div>
      </div>

      {/* Per barber */}
      {perBarber.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-700 text-sm">
            {t("reports.perBarber")}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="th-start px-4 py-2 font-medium text-gray-600">{t("field.barber")}</th>
                <th className="text-end px-4 py-2 font-medium text-gray-600">{t("discounts.count")}</th>
                <th className="text-end px-4 py-2 font-medium text-gray-600">{t("discounts.amount")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {perBarber.map((b) => (
                <tr key={b.barberName} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-900">{b.barberName}</td>
                  <td className="px-4 py-2 text-end text-gray-600 tabular-nums">{b.count}</td>
                  <td className="px-4 py-2 text-end font-medium text-red-600 tabular-nums">
                    {fmtCurrency(b.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Every discounted visit, with its services */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <div key={i} className="card h-14 animate-pulse bg-gray-100" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="card p-8 text-center text-gray-400">
          <div className="text-3xl mb-2">🏷️</div>
          <div className="text-sm">{t("discounts.none")}</div>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("field.dateTime")}</th>
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("visit.receiptNo")}</th>
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("field.name")}</th>
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("field.barber")}</th>
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("field.services")}</th>
                <th className="text-end px-4 py-3 font-medium text-gray-600">{t("field.subtotal")}</th>
                <th className="text-end px-4 py-3 font-medium text-gray-600">{t("field.discount")}</th>
                <th className="text-end px-4 py-3 font-medium text-gray-600">{t("field.total")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <Fragment key={r.id}>
                  <tr
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setOpen(open === r.id ? null : r.id)}
                  >
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {fmtDateTime(r.visitAt)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.receiptNo ? `#${r.receiptNo}` : "—"}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {fmtCustomerName(r.customerName)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.barberName ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-64 truncate">
                      {r.items.map((i) => serviceName(i)).join(", ")}
                    </td>
                    <td className="px-4 py-3 text-end text-gray-600 tabular-nums">
                      {fmtCurrency(r.subtotal)}
                    </td>
                    <td className="px-4 py-3 text-end whitespace-nowrap">
                      <span className="font-semibold text-red-600 tabular-nums">
                        -{fmtCurrency(r.discountAmount)}
                      </span>
                      <span className="ms-1 text-xs text-gray-400">({r.discountPercent}%)</span>
                    </td>
                    <td className="px-4 py-3 text-end font-semibold text-gray-900 tabular-nums">
                      {fmtCurrency(r.total)}
                    </td>
                  </tr>

                  {open === r.id && (
                    <tr className="bg-gray-50/70">
                      <td colSpan={8} className="px-6 py-4">
                        <div className="flex flex-wrap gap-x-8 gap-y-2 mb-3 text-xs">
                          <div>
                            <div className="text-gray-500">{t("field.paymentMethod")}</div>
                            <div className="text-gray-900">{payLabel(r.paymentMethod)}</div>
                          </div>
                          <div>
                            <div className="text-gray-500">{t("discounts.recordedBy")}</div>
                            <div className="text-gray-900">
                              {r.recordedBy ?? t("discounts.notRecorded")}
                            </div>
                          </div>
                          {r.notes && (
                            <div>
                              <div className="text-gray-500">{t("field.notes")}</div>
                              <div className="text-gray-900">{r.notes}</div>
                            </div>
                          )}
                        </div>

                        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-200">
                                <th className="th-start px-3 py-2 font-medium text-gray-600">
                                  {t("field.service")}
                                </th>
                                <th className="text-end px-3 py-2 font-medium text-gray-600">
                                  {t("field.quantity")}
                                </th>
                                <th className="text-end px-3 py-2 font-medium text-gray-600">
                                  {t("field.price")}
                                </th>
                                <th className="text-end px-3 py-2 font-medium text-gray-600">
                                  {t("field.total")}
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {r.items.map((i, idx) => (
                                <tr key={idx}>
                                  <td className="px-3 py-2 text-gray-900">{serviceName(i)}</td>
                                  <td className="px-3 py-2 text-end text-gray-600">{i.quantity}</td>
                                  <td className="px-3 py-2 text-end text-gray-600">{fmtCurrency(i.price)}</td>
                                  <td className="px-3 py-2 text-end font-medium text-gray-900">
                                    {fmtCurrency(i.lineTotal)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="bg-gray-50 border-t border-gray-200">
                                <td colSpan={3} className="px-3 py-2 text-gray-600">{t("field.subtotal")}</td>
                                <td className="px-3 py-2 text-end tabular-nums">{fmtCurrency(r.subtotal)}</td>
                              </tr>
                              <tr className="bg-gray-50">
                                <td colSpan={3} className="px-3 py-2 text-red-600">
                                  {t("field.discount")} ({r.discountPercent}%)
                                </td>
                                <td className="px-3 py-2 text-end text-red-600 tabular-nums">
                                  -{fmtCurrency(r.discountAmount)}
                                </td>
                              </tr>
                              <tr className="bg-gray-50 border-t border-gray-200">
                                <td colSpan={3} className="px-3 py-2 font-semibold text-gray-900">
                                  {t("field.total")}
                                </td>
                                <td className="px-3 py-2 text-end font-bold text-gray-900 tabular-nums">
                                  {fmtCurrency(r.total)}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200">
                <td colSpan={5} className="px-4 py-3 font-semibold text-gray-700">
                  {t("discounts.totalGiven")}
                  <span className="ms-2 text-xs font-normal text-gray-400">
                    {fmtDate(from)} — {fmtDate(to)}
                  </span>
                </td>
                <td className="px-4 py-3 text-end tabular-nums text-gray-700">
                  {fmtCurrency(summary?.subtotalTotal ?? 0)}
                </td>
                <td className="px-4 py-3 text-end font-bold text-red-600 tabular-nums">
                  -{fmtCurrency(summary?.discountTotal ?? 0)}
                </td>
                <td className="px-4 py-3 text-end font-bold text-gray-900 tabular-nums">
                  {fmtCurrency((summary?.subtotalTotal ?? 0) - (summary?.discountTotal ?? 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
