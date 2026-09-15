"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "@/lib/i18n";
import { PaymentFields, NO_PAYMENT_AMOUNTS, type PaymentAmounts } from "@/components/ui/PaymentFields";
import { resolvePaymentAmounts, tipPaidInCash, type VisitPaymentMethod } from "@/lib/payments";

interface Service { id: string; name: string; defaultPrice: number; isActive: boolean; }
interface Barber  { id: string; name: string; }
interface Customer { id: string; name: string; phone: string | null; }
interface CartItem { serviceId: string; serviceName: string; quantity: number; priceAtTime: number; }

export default function EditVisitPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { t, fmtCurrency } = useTranslation();

  const [services, setServices]   = useState<Service[]>([]);
  const [barbers,  setBarbers]    = useState<Barber[]>([]);
  const [customer, setCustomer]   = useState<Customer | null>(null);
  const [loading,  setLoading]    = useState(true);
  const [notFound, setNotFound]   = useState(false);

  const [barberId,      setBarberId]      = useState("");
  const [visitAt,       setVisitAt]       = useState("");
  const [paymentMethod, setPaymentMethod] = useState<VisitPaymentMethod>("CASH");
  const [discount,      setDiscount]      = useState(0);
  const [notes,         setNotes]         = useState("");
  const [cart,          setCart]          = useState<CartItem[]>([]);
  const [amounts,       setAmounts]       = useState<PaymentAmounts>(NO_PAYMENT_AMOUNTS);
  const [tip,           setTip]           = useState(0);
  const [submitting,    setSubmitting]    = useState(false);
  const [error,         setError]         = useState("");

  const loadVisit = useCallback(async () => {
    const [visitRes, svcsRes, brbsRes] = await Promise.all([
      fetch(`/api/visits/${id}`),
      fetch("/api/services?active=true"),
      fetch("/api/barbers?active=true"),
    ]);

    if (!visitRes.ok) { setNotFound(true); setLoading(false); return; }

    const visit = await visitRes.json();
    const svcs: Service[] = await svcsRes.json();
    const brbs: Barber[]  = await brbsRes.json();

    setServices(Array.isArray(svcs) ? svcs : []);
    setBarbers(Array.isArray(brbs) ? brbs : []);
    setCustomer(visit.customer);
    setBarberId(visit.barberId);
    setVisitAt((() => { const d = new Date(visit.visitAt); const p = (x: number) => String(x).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; })());
    setPaymentMethod(visit.paymentMethod);
    setDiscount(visit.discount);
    setNotes(visit.notes ?? "");
    setAmounts({
      cashAmount: visit.cashAmount ?? 0,
      cardAmount: visit.cardAmount ?? 0,
      instapayAmount: visit.instapayAmount ?? 0,
    });
    setTip(visit.tip ?? 0);
    setCart(
      visit.items.map((i: { serviceId: string; service: { name: string }; quantity: number; priceAtTime: number }) => ({
        serviceId: i.serviceId,
        serviceName: i.service.name,
        quantity: i.quantity,
        priceAtTime: i.priceAtTime,
      }))
    );
    setLoading(false);
  }, [id]);

  useEffect(() => { loadVisit(); }, [loadVisit]);

  const addToCart = (s: Service) => setCart((prev) => {
    const existing = prev.find((i) => i.serviceId === s.id);
    if (existing) return prev.map((i) => i.serviceId === s.id ? { ...i, quantity: i.quantity + 1 } : i);
    return [...prev, { serviceId: s.id, serviceName: s.name, quantity: 1, priceAtTime: s.defaultPrice }];
  });

  const updateItem = (serviceId: string, field: "quantity" | "priceAtTime", value: number) =>
    setCart((prev) => prev.map((i) => i.serviceId === serviceId ? { ...i, [field]: value } : i));

  const removeFromCart = (serviceId: string) =>
    setCart((prev) => prev.filter((i) => i.serviceId !== serviceId));

  const subtotal = cart.reduce((s, i) => s + i.priceAtTime * i.quantity, 0);
  const discountAmount = (subtotal * discount) / 100;
  const total = subtotal - discountAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (cart.length === 0) { setError(t("newVisit.noServices")); return; }
    if (paymentMethod === "MIXED" && !resolvePaymentAmounts("MIXED", total, amounts)) {
      setError(t("newVisit.splitMustEqualTotal")); return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/visits/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customer!.id,
          barberId,
          visitAt: new Date(visitAt).toISOString(),
          paymentMethod,
          discount,
          notes,
          tip,
          items: cart.map((i) => ({ serviceId: i.serviceId, quantity: i.quantity, priceAtTime: i.priceAtTime })),
          ...(paymentMethod === "MIXED" ? amounts : {}),
        }),
      });
      if (res.ok) router.push("/visits");
      else { const d = await res.json(); setError(d.error ?? "Failed to save visit"); }
    } catch {
      setError("Network error — please try again");
    } finally { setSubmitting(false); }
  };

  if (loading) return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-100 rounded w-1/3" />
        <div className="h-64 bg-gray-100 rounded" />
      </div>
    </div>
  );

  if (notFound) return (
    <div className="p-6 max-w-4xl mx-auto">
      <p className="text-red-600">Visit not found.</p>
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeader title={t("action.edit") + " " + t("visits.title").slice(0, -1)} subtitle={customer?.name ?? ""} />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Visit Details */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">{t("newVisit.visitDetails")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Customer (read-only) */}
            <div>
              <label className="label">{t("customers.title")}</label>
              <div className="input bg-gray-50 text-gray-700 font-medium">{customer?.name}</div>
            </div>

            {/* Barber */}
            <div>
              <label className="label">{t("field.barber")} *</label>
              <select className="input" value={barberId} onChange={(e) => setBarberId(e.target.value)} required>
                <option value="">{t("newVisit.selectBarber")}</option>
                {barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>

            <div>
              <label className="label">{t("field.dateTime")}</label>
              <input type="datetime-local" className="input" value={visitAt} onChange={(e) => setVisitAt(e.target.value)} />
            </div>

            <PaymentFields
              method={paymentMethod}
              onMethodChange={setPaymentMethod}
              amounts={amounts}
              onAmountsChange={setAmounts}
              total={total}
            />
          </div>
        </div>

        {/* Services */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">{t("field.services")}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-4">
            {services.map((s) => {
              const inCart = cart.some((i) => i.serviceId === s.id);
              return (
                <button key={s.id} type="button" onClick={() => addToCart(s)}
                  className={`text-start px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                    inCart ? "border-primary-400 bg-primary-50 text-primary-700" : "border-gray-200 hover:border-primary-300 hover:bg-primary-50"
                  }`}>
                  <div className="truncate">{s.name}</div>
                  <div className="text-gray-400 font-normal">${fmtCurrency(s.defaultPrice)}</div>
                </button>
              );
            })}
          </div>

          {cart.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="th-start px-3 py-2 font-medium text-gray-600">{t("field.service")}</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-600">{t("field.quantity")}</th>
                    <th className="text-end px-3 py-2 font-medium text-gray-600">{t("field.price")}</th>
                    <th className="text-end px-3 py-2 font-medium text-gray-600">{t("field.line")}</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cart.map((item) => (
                    <tr key={item.serviceId}>
                      <td className="px-3 py-2 text-gray-900">{item.serviceName}</td>
                      <td className="px-3 py-2 text-center">
                        <input type="number" min="1" className="w-14 text-center input py-1"
                          value={item.quantity}
                          onChange={(e) => updateItem(item.serviceId, "quantity", parseInt(e.target.value) || 1)} />
                      </td>
                      <td className="px-3 py-2 text-end">
                        <input type="number" min="0" step="0.01" className="w-20 text-end input py-1"
                          value={item.priceAtTime}
                          onChange={(e) => updateItem(item.serviceId, "priceAtTime", parseFloat(e.target.value) || 0)} />
                      </td>
                      <td className="px-3 py-2 text-end font-medium">${fmtCurrency(item.priceAtTime * item.quantity)}</td>
                      <td className="px-3 py-2 text-end">
                        <button type="button" onClick={() => removeFromCart(item.serviceId)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">{t("newVisit.summary")}</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <label className="label mb-0 flex-1">{t("newVisit.discountPercent")}</label>
              <input type="number" min="0" max="100" step="1" className="input w-24 text-end"
                value={discount} onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="flex items-center gap-4">
              <label className="label mb-0 flex-1">{t("field.notes")}</label>
              <input className="input flex-1" placeholder={t("newVisit.notesPlaceholder")}
                value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200 space-y-1">
            <div className="flex justify-between text-sm text-gray-600">
              <span>{t("field.subtotal")}</span>
              <span>${fmtCurrency(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-sm text-red-500">
                <span>{t("field.discount")} ({discount}%)</span>
                <span>-${fmtCurrency(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-gray-900 pt-1">
              <span>{t("field.total")}</span>
              <span>${fmtCurrency(total)}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <label className="text-sm text-gray-600">{t("newVisit.tip")}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input w-28 text-end"
                value={tip}
                onChange={(e) => setTip(parseFloat(e.target.value) || 0)}
              />
            </div>
            {!tipPaidInCash({ paymentMethod, cashAmount: amounts.cashAmount }) && tip > 0 && (
              <p className="text-xs text-amber-600">{t("newVisit.cardTipNote")}</p>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={() => router.back()} className="btn-secondary flex-1">{t("action.cancel")}</button>
          <button type="submit" disabled={submitting || cart.length === 0} className="btn-primary flex-1">
            {submitting ? t("action.saving") : t("action.save") + " — $" + fmtCurrency(total)}
          </button>
        </div>
      </form>
    </div>
  );
}
