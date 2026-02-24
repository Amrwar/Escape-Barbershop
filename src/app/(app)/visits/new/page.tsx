"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { useTranslation } from "@/lib/i18n";

interface Service { id: string; name: string; defaultPrice: number; isActive: boolean; }
interface Barber  { id: string; name: string; }
interface Customer { id: string; name: string; phone: string | null; }
interface CartItem { serviceId: string; serviceName: string; quantity: number; priceAtTime: number; }

function NewVisitInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: session } = useSession();
  const isOwner = session?.user?.role === "OWNER";
  const { t, fmtCurrency } = useTranslation();

  const [services, setServices] = useState<Service[]>([]);
  const [barbers,  setBarbers]  = useState<Barber[]>([]);
  const [loading,  setLoading]  = useState(true);

  const [customerSearch, setCustomerSearch]   = useState("");
  const [customers,      setCustomers]        = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showDropdown, setShowDropdown]        = useState(false);
  const [newCustModal, setNewCustModal]         = useState(false);
  const [newCustForm,  setNewCustForm]          = useState({ name: "", phone: "" });

  const [barberId,       setBarberId]       = useState(session?.user?.barberId ?? "");
  const [visitAt,        setVisitAt]        = useState(() => new Date().toISOString().slice(0, 16));
  const [paymentMethod,  setPaymentMethod]  = useState<"CASH"|"CARD"|"MIXED">("CASH");
  const [discount,       setDiscount]       = useState(0);
  const [notes,          setNotes]          = useState("");
  const [cart,           setCart]           = useState<CartItem[]>([]);
  const [submitting,     setSubmitting]     = useState(false);
  const [error,          setError]          = useState("");
  const [cashAmount,     setCashAmount]     = useState(0);
  const [cardAmount,     setCardAmount]     = useState(0);

  const preCustomerId = params.get("customerId");

  useEffect(() => {
    Promise.all([
      fetch("/api/services?active=true").then((r) => r.json()),
      fetch("/api/barbers?active=true").then((r) => r.json()),
    ]).then(([svcs, brbs]) => {
      setServices(Array.isArray(svcs) ? svcs.filter((s: Service) => s.isActive) : []);
      setBarbers(Array.isArray(brbs) ? brbs : []);
      if (!isOwner && session?.user?.barberId) setBarberId(session.user.barberId);
      setLoading(false);
    });
  }, [isOwner, session]);

  useEffect(() => {
    if (preCustomerId) {
      fetch(`/api/customers/${preCustomerId}`).then((r) => r.json()).then((c) => setSelectedCustomer(c));
    }
  }, [preCustomerId]);

  const searchCustomers = useCallback((q: string) => {
    if (!q.trim()) { setCustomers([]); return; }
    fetch(`/api/customers?search=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((data) => setCustomers(Array.isArray(data) ? data : []));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchCustomers(customerSearch), 250);
    return () => clearTimeout(t);
  }, [customerSearch, searchCustomers]);

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

  const createCustomer = async () => {
    if (!newCustForm.name.trim()) return;
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCustForm.name, phone: newCustForm.phone || null }),
    });
    const customer = await res.json();
    setSelectedCustomer(customer);
    setNewCustModal(false);
    setNewCustForm({ name: "", phone: "" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!selectedCustomer) { setError(t("newVisit.noCustomer")); return; }
    if (!barberId)          { setError(t("newVisit.noBarber"));   return; }
    if (cart.length === 0)  { setError(t("newVisit.noServices")); return; }
    if (paymentMethod === "MIXED" && Math.abs(cashAmount + cardAmount - total) > 0.01) {
      setError(t("newVisit.splitMustEqualTotal")); return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          barberId,
          visitAt,
          paymentMethod,
          discount,
          notes: notes || null,
          items: cart.map((i) => ({ serviceId: i.serviceId, quantity: i.quantity, priceAtTime: i.priceAtTime })),
          ...(paymentMethod === "MIXED" ? { cashAmount, cardAmount } : {}),
        }),
      });
      if (res.ok) router.push("/visits");
      else { const d = await res.json(); setError(d.error ?? "Failed"); }
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

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeader title={t("newVisit.title")} subtitle={t("newVisit.subtitle")} />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Visit Details */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">{t("newVisit.visitDetails")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Customer */}
            <div className="relative">
              <label className="label">{t("field.barber").replace(t("field.barber"), t("customers.title"))} *</label>
              <label className="label">{t("customers.title")} *</label>
              {selectedCustomer ? (
                <div className="flex items-center gap-2">
                  <div className="input flex-1 bg-primary-50 border-primary-200 text-primary-800 font-medium truncate">
                    {selectedCustomer.name}
                    {selectedCustomer.phone && <span className="text-primary-400 ms-2 font-normal text-xs">{selectedCustomer.phone}</span>}
                  </div>
                  <button type="button" onClick={() => setSelectedCustomer(null)} className="btn-ghost text-xs px-2 py-2">✕</button>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <input className="input flex-1" placeholder={t("newVisit.selectCustomer")}
                      value={customerSearch}
                      onChange={(e) => { setCustomerSearch(e.target.value); setShowDropdown(true); }}
                      onFocus={() => setShowDropdown(true)}
                      onBlur={() => setTimeout(() => setShowDropdown(false), 200)} />
                    <button type="button" onClick={() => setNewCustModal(true)} className="btn-secondary text-xs whitespace-nowrap">
                      + {t("customers.newCustomer")}
                    </button>
                  </div>
                  {showDropdown && customers.length > 0 && (
                    <div className="absolute z-10 top-full mt-1 start-0 end-0 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {customers.map((c) => (
                        <button key={c.id} type="button"
                          onMouseDown={() => { setSelectedCustomer(c); setCustomerSearch(""); setShowDropdown(false); }}
                          className="w-full text-start px-4 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-0">
                          <div className="text-sm font-medium text-gray-900">{c.name}</div>
                          {c.phone && <div className="text-xs text-gray-400">{c.phone}</div>}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Barber */}
            <div>
              <label className="label">{t("field.barber")} *</label>
              {isOwner ? (
                <select className="input" value={barberId} onChange={(e) => setBarberId(e.target.value)} required>
                  <option value="">{t("newVisit.selectBarber")}</option>
                  {barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              ) : (
                <div className="input bg-gray-50 text-gray-700">
                  {barbers.find((b) => b.id === barberId)?.name ?? "—"}
                </div>
              )}
            </div>

            <div>
              <label className="label">{t("field.dateTime")}</label>
              <input type="datetime-local" className="input" value={visitAt} onChange={(e) => setVisitAt(e.target.value)} />
            </div>

            <div>
              <label className="label">{t("field.paymentMethod")}</label>
              <select className="input" value={paymentMethod} onChange={(e) => {
                setPaymentMethod(e.target.value as "CASH"|"CARD"|"MIXED");
                if (e.target.value !== "MIXED") { setCashAmount(0); setCardAmount(0); }
              }}>
                <option value="CASH">{t("common.cash")}</option>
                <option value="CARD">{t("common.card")}</option>
                <option value="MIXED">{t("common.mixed")}</option>
              </select>
            </div>

            {paymentMethod === "MIXED" && (
              <>
                <div>
                  <label className="label">{t("newVisit.cashAmount")}</label>
                  <input type="number" min="0" step="0.01" className="input"
                    value={cashAmount}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      setCashAmount(v);
                      setCardAmount(Math.max(0, parseFloat((total - v).toFixed(2))));
                    }} />
                </div>
                <div>
                  <label className="label">{t("newVisit.cardAmount")}</label>
                  <input type="number" min="0" step="0.01" className="input"
                    value={cardAmount}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      setCardAmount(v);
                      setCashAmount(Math.max(0, parseFloat((total - v).toFixed(2))));
                    }} />
                  {Math.abs(cashAmount + cardAmount - total) > 0.01 && (
                    <p className="text-xs text-amber-600 mt-1">{t("newVisit.splitMustEqualTotal")}</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Services grid */}
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
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={() => router.back()} className="btn-secondary flex-1">{t("action.cancel")}</button>
          <button type="submit" disabled={submitting || cart.length === 0} className="btn-primary flex-1">
            {submitting ? t("action.saving") : `${t("newVisit.saveVisit")} — $${fmtCurrency(total)}`}
          </button>
        </div>
      </form>

      {/* New customer modal */}
      <Modal open={newCustModal} onClose={() => setNewCustModal(false)} title={t("customers.newCustomer")} size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">{t("field.name")} *</label>
            <input className="input" value={newCustForm.name}
              onChange={(e) => setNewCustForm({ ...newCustForm, name: e.target.value })} />
          </div>
          <div>
            <label className="label">{t("field.phone")} <span className="text-gray-400 font-normal">({t("field.optional")})</span></label>
            <input className="input" value={newCustForm.phone}
              onChange={(e) => setNewCustForm({ ...newCustForm, phone: e.target.value })} />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setNewCustModal(false)} className="btn-secondary flex-1">{t("action.cancel")}</button>
            <button type="button" onClick={createCustomer} disabled={!newCustForm.name.trim()} className="btn-primary flex-1">
              {t("action.createSelect")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function NewVisitPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-400">Loading…</div>}>
      <NewVisitInner />
    </Suspense>
  );
}
