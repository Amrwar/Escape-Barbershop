"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { useTranslation } from "@/lib/i18n";
import { PaymentFields, NO_PAYMENT_AMOUNTS, type PaymentAmounts } from "@/components/ui/PaymentFields";
import { resolvePaymentAmounts, tipPaidInCash, type VisitPaymentMethod } from "@/lib/payments";

interface Service { id: string; name: string; arabicName: string | null; defaultPrice: number; isActive: boolean; }
interface Barber  { id: string; name: string; }
interface Customer { id: string; name: string; phone: string | null; }
interface CartItem { serviceId: string; serviceName: string; serviceArabicName: string | null; quantity: number; priceAtTime: number; }

function NewVisitInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: session } = useSession();
  const isOwner = session?.user?.role === "OWNER";
  const { t, fmtCurrency, fmtTime, lang } = useTranslation();

  const [services, setServices] = useState<Service[]>([]);
  const [barbers,  setBarbers]  = useState<Barber[]>([]);
  const [loading,  setLoading]  = useState(true);

  const [customerSearch, setCustomerSearch]   = useState("");
  const [customers,      setCustomers]        = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  // The customer's punch card, looked up while they stand at the counter.
  const [loyalty, setLoyalty] = useState<{ text: string | null; available: number } | null>(null);
  const [useReward, setUseReward] = useState(false);
  const [referral, setReferral] = useState<{ text: string | null; waiting: number } | null>(null);
  const [showDropdown, setShowDropdown]        = useState(false);
  const [newCustModal, setNewCustModal]         = useState(false);
  const [newCustForm,  setNewCustForm]          = useState({ name: "", phone: "" });

  const [barberId,       setBarberId]       = useState(session?.user?.barberId ?? "");
  const [visitAt,        setVisitAt]        = useState(() => { const n = new Date(); const p = (x: number) => String(x).padStart(2, "0"); return `${n.getFullYear()}-${p(n.getMonth()+1)}-${p(n.getDate())}T${p(n.getHours())}:${p(n.getMinutes())}`; });
  const [paymentMethod,  setPaymentMethod]  = useState<VisitPaymentMethod>("CASH");
  const [discount,       setDiscount]       = useState(0);
  const [notes,          setNotes]          = useState("");
  const [cart,           setCart]           = useState<CartItem[]>([]);
  // Anything sold over the counter on this visit, with what is on the shelf.
  const [sellable, setSellable] = useState<{ id: string; name: string; salePrice: number; branch: number }[]>([]);
  const [productCart, setProductCart] = useState<{ productId: string; name: string; quantity: number; unitPrice: number }[]>([]);
  const [submitting,     setSubmitting]     = useState(false);
  const [error,          setError]          = useState("");
  const [amounts,        setAmounts]        = useState<PaymentAmounts>(NO_PAYMENT_AMOUNTS);
  const [tip,           setTip]            = useState(0);

  // Discount PIN gate
  const [discountUnlocked, setDiscountUnlocked] = useState(false);
  const [pinModal,          setPinModal]          = useState(false);
  const [pinInput,          setPinInput]          = useState("");
  const [pinError,          setPinError]          = useState("");
  const [verifyingPin,      setVerifyingPin]      = useState(false);

  const preCustomerId = params.get("customerId");
  const appointmentId = params.get("appointmentId");
  const [appointment, setAppointment] = useState<{ startAt: string; barber: { id: string; name: string } | null } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/services?active=true").then((r) => r.json()),
      fetch("/api/barbers?active=true").then((r) => r.json()),
    ]).then(([svcs, brbs]) => {
      const active = Array.isArray(svcs) ? svcs.filter((s: Service) => s.isActive) : [];
      // Group order: regular (0) → pedicure (1) → skin (2) → l'oreal (3)
      const groupOf = (s: Service) => {
        const n = s.name + " " + (s.arabicName ?? "");
        if (/l.?oreal|techniart/i.test(n)) return 3;
        if (/skin|facial|hydrofacial/i.test(n)) return 2;
        if (/pedicure/i.test(n)) return 1;
        return 0;
      };
      active.sort((a: Service, b: Service) => groupOf(a) - groupOf(b));
      setServices(active);
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

  // Ringing up a booking: the customer, barber and services are already known,
  // so the cashier only has to take the money.
  useEffect(() => {
    if (!appointmentId) return;
    fetch(`/api/appointments/${appointmentId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((a) => {
        if (!a) return;
        setAppointment({ startAt: a.startAt, barber: a.barber });
        setSelectedCustomer(a.customer);
        if (a.barber?.id) setBarberId(a.barber.id);
        setCart(
          a.services.map((s: { serviceId: string; serviceName: string; price: number }) => ({
            serviceId: s.serviceId,
            serviceName: s.serviceName,
            serviceArabicName: null,
            quantity: 1,
            priceAtTime: s.price,
          }))
        );
      });
  }, [appointmentId]);

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
    return [...prev, { serviceId: s.id, serviceName: s.name, serviceArabicName: s.arabicName ?? null, quantity: 1, priceAtTime: s.defaultPrice }];
  });

  const updateItem = (serviceId: string, field: "quantity" | "priceAtTime", value: number) =>
    setCart((prev) => prev.map((i) => i.serviceId === serviceId ? { ...i, [field]: value } : i));

  const removeFromCart = (serviceId: string) =>
    setCart((prev) => prev.filter((i) => i.serviceId !== serviceId));

  const verifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError("");
    setVerifyingPin(true);
    try {
      const res = await fetch("/api/settings/discount-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinInput }),
      });
      const data = await res.json();
      if (data.valid) {
        setDiscountUnlocked(true);
        setPinModal(false);
        setPinInput("");
      } else {
        setPinError(t("newVisit.wrongPin"));
      }
    } finally {
      setVerifyingPin(false);
    }
  };

  const subtotal = cart.reduce((s, i) => s + i.priceAtTime * i.quantity, 0);
  const discountAmount = (subtotal * discount) / 100;
  // A product is sold at the price typed, so the discount never comes off it.
  const productsTotal = productCart.reduce((s, p) => s + p.unitPrice * p.quantity, 0);
  const total = subtotal - discountAmount + productsTotal;

  const addProduct = (id: string) => {
    const product = sellable.find((p) => p.id === id);
    if (!product) return;
    setProductCart((prev) =>
      prev.some((p) => p.productId === id)
        ? prev.map((p) => (p.productId === id ? { ...p, quantity: p.quantity + 1 } : p))
        : [...prev, { productId: id, name: product.name, quantity: 1, unitPrice: product.salePrice }]
    );
  };

  const updateProduct = (productId: string, field: "quantity" | "unitPrice", value: number) =>
    setProductCart((prev) => prev.map((p) => (p.productId === productId ? { ...p, [field]: value } : p)));

  useEffect(() => {
    fetch("/api/stock/balances")
      .then((r) => r.json())
      .then((d) => {
        const rows = Array.isArray(d) ? d : d.rows ?? [];
        setSellable(
          rows
            .filter((r: { salePrice?: number; branch?: number }) => (r.salePrice ?? 0) > 0)
            .map((r: { id: string; name: string; salePrice: number; branch: number }) => ({
              id: r.id,
              name: r.name,
              salePrice: r.salePrice,
              branch: r.branch ?? 0,
            }))
        );
      })
      .catch(() => setSellable([]));
  }, []);

  const [walkInLoading, setWalkInLoading] = useState(false);

  const createWalkIn = async () => {
    setWalkInLoading(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "", phone: "" }),
      });
      const customer = await res.json();
      setSelectedCustomer(customer);
    } finally {
      setWalkInLoading(false);
    }
  };

  const createCustomer = async () => {
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCustForm.name || "", phone: newCustForm.phone }),
    });
    const customer = await res.json();
    setSelectedCustomer(customer);
    setNewCustModal(false);
    setNewCustForm({ name: "", phone: "" });
  };

  // Fetch the card whenever the customer changes, and never carry one
  // customer's reward over to the next.
  useEffect(() => {
    setUseReward(false);
    if (!selectedCustomer) { setLoyalty(null); return; }
    fetch(`/api/loyalty/${selectedCustomer.id}`)
      .then((r) => r.json())
      .then((d) => setLoyalty(d?.settings?.enabled ? { text: d.text, available: d.standing.available } : null))
      .catch(() => setLoyalty(null));

    fetch(`/api/referrals/${selectedCustomer.id}`)
      .then((r) => r.json())
      .then((d) => setReferral(d?.settings?.enabled ? { text: d.text, waiting: d.standing.waiting } : null))
      .catch(() => setReferral(null));
  }, [selectedCustomer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!selectedCustomer) { setError(t("newVisit.noCustomer")); return; }
    if (!barberId)          { setError(t("newVisit.noBarber"));   return; }
    if (cart.length === 0)  { setError(t("newVisit.noServices")); return; }
    if (paymentMethod === "MIXED" && !resolvePaymentAmounts("MIXED", total, amounts)) {
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
          visitAt: new Date(visitAt).toISOString(),
          paymentMethod,
          discount,
          notes,
          tip,
          items: cart.map((i) => ({ serviceId: i.serviceId, quantity: i.quantity, priceAtTime: i.priceAtTime })),
          products: productCart.map((p) => ({ productId: p.productId, quantity: p.quantity, unitPrice: p.unitPrice })),
          ...(appointmentId ? { appointmentId } : {}),
          ...(paymentMethod === "MIXED" ? amounts : {}),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        // Recorded against the visit it was given on, and never allowed to
        // stop a visit that is already rung up.
        if (useReward && loyalty && loyalty.available > 0) {
          await fetch(`/api/loyalty/${selectedCustomer.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ visitId: data.id }),
          }).catch(() => undefined);
        }
        router.push("/visits/" + data.id);
      }
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

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeader title={t("newVisit.title")} subtitle={t("newVisit.subtitle")} />

      {appointment && (
        <div className="mb-5 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm">
          <span className="font-semibold text-primary-800">{t("appointments.settling")}</span>
          <span className="text-primary-700">
            {" — "}
            {t("appointments.settlingFor")} {fmtTime(appointment.startAt)}
            {appointment.barber ? ` · ${appointment.barber.name}` : ""}
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Visit Details */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">{t("newVisit.visitDetails")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Customer */}
            <div className="relative">
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
                    <button type="button" onClick={createWalkIn} disabled={walkInLoading}
                      className="btn-primary text-xs whitespace-nowrap">
                      {walkInLoading ? "…" : t("newVisit.walkIn")}
                    </button>
                    <button type="button" onClick={() => setNewCustModal(true)} className="btn-secondary text-xs whitespace-nowrap">
                      + {t("customers.newCustomer")}
                    </button>
                  </div>
                  {showDropdown && customers.length > 0 && (
                    <div className="absolute z-10 top-full mt-1 start-0 end-0 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {customers.map((c) => (
                        <button key={c.id} type="button"
                          // onMouseDown fires before the input's blur closes the list;
                          // onClick is what a keyboard sends, so both are needed.
                          onMouseDown={() => { setSelectedCustomer(c); setCustomerSearch(""); setShowDropdown(false); }}
                          onClick={() => { setSelectedCustomer(c); setCustomerSearch(""); setShowDropdown(false); }}
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

            {/* The punch card, if the shop runs one */}
            {selectedCustomer && loyalty?.text && (
              <div className="sm:col-span-2 -mt-1">
                <div
                  className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${
                    loyalty.available > 0
                      ? "border-amber-300 bg-amber-50 text-amber-900"
                      : "border-gray-200 bg-gray-50 text-gray-600"
                  }`}
                >
                  <span>{loyalty.text}</span>
                  {loyalty.available > 0 && (
                    <label className="flex shrink-0 items-center gap-2 text-xs font-medium">
                      <input type="checkbox" checked={useReward} onChange={(e) => setUseReward(e.target.checked)} />
                      {t("loyalty.useReward")}
                    </label>
                  )}
                </div>
              </div>
            )}

            {/* Somebody they brought in has been in */}
            {selectedCustomer && referral?.text && (
              <div className="sm:col-span-2 -mt-1">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <span>{referral.text}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await fetch(`/api/referrals/${selectedCustomer.id}`, { method: "POST" });
                      if (res.ok) {
                        const d = await res.json();
                        setReferral({ text: d.text, waiting: d.standing.waiting });
                      }
                    }}
                    className="btn-secondary shrink-0 text-xs"
                  >
                    {t("referrals.give")}
                  </button>
                </div>
              </div>
            )}

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

        {/* Services grid */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">{t("field.services")}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-4">
            {services.map((s) => {
              const inCart = cart.some((i) => i.serviceId === s.id);
              const isPedicure = /pedicure/i.test(s.name) || /pedicure/i.test(s.arabicName ?? "");
              const isSkin = /skin|facial|hydrofacial/i.test(s.name) || /skin|facial|hydrofacial/i.test(s.arabicName ?? "");
              const isLoreal = /l.?oreal|techniart/i.test(s.name) || /l.?oreal|techniart/i.test(s.arabicName ?? "");
              const className = isPedicure
                ? inCart
                  ? "border-rose-400 bg-rose-50 text-rose-700"
                  : "border-rose-200 bg-rose-50/40 text-rose-900 hover:border-rose-400 hover:bg-rose-50"
                : isSkin
                  ? inCart
                    ? "border-teal-400 bg-teal-50 text-teal-700"
                    : "border-teal-200 bg-teal-50/40 text-teal-900 hover:border-teal-400 hover:bg-teal-50"
                  : isLoreal
                    ? inCart
                      ? "border-amber-400 bg-amber-50 text-amber-800"
                      : "border-amber-200 bg-amber-50/60 text-amber-900 hover:border-amber-400 hover:bg-amber-50"
                    : inCart
                      ? "border-primary-400 bg-primary-50 text-primary-700"
                      : "border-gray-200 hover:border-primary-300 hover:bg-primary-50";
              const priceColor = isPedicure ? "text-rose-400" : isSkin ? "text-teal-400" : isLoreal ? "text-amber-400" : "text-gray-400";
              return (
                <button key={s.id} type="button" onClick={() => addToCart(s)}
                  className={`text-start px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${className}`}>
                  <div className="truncate">{lang === "ar" && s.arabicName ? s.arabicName : s.name}</div>
                  <div className={`font-normal ${priceColor}`}>{fmtCurrency(s.defaultPrice)}</div>
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
                      <td className="px-3 py-2 text-gray-900">{lang === "ar" && item.serviceArabicName ? item.serviceArabicName : item.serviceName}</td>
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
                      <td className="px-3 py-2 text-end font-medium">{fmtCurrency(item.priceAtTime * item.quantity)}</td>
                      <td className="px-3 py-2 text-end">
                        <button type="button" onClick={() => removeFromCart(item.serviceId)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {sellable.length > 0 && (
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">{t("till.products")}</h3>
                <select
                  className="input w-56 py-1.5 text-sm"
                  value=""
                  onChange={(e) => addProduct(e.target.value)}
                >
                  <option value="">{t("till.addProduct")}</option>
                  {sellable.map((p) => (
                    <option key={p.id} value={p.id} disabled={p.branch <= 0}>
                      {p.name} — {fmtCurrency(p.salePrice)} ({t("till.productStock").replace("{count}", String(p.branch))})
                    </option>
                  ))}
                </select>
              </div>

              {productCart.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-gray-100">
                      {productCart.map((line) => {
                        const shelf = sellable.find((p) => p.id === line.productId)?.branch ?? 0;
                        const short = line.quantity > shelf;
                        return (
                          <tr key={line.productId}>
                            <td className="px-3 py-2 text-gray-900">
                              {line.name}
                              {short && (
                                <span className="ms-2 text-xs text-red-600">
                                  {t("till.productShort").replace("{count}", String(shelf))}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <input
                                type="number"
                                min="1"
                                className="input w-14 py-1 text-center"
                                value={line.quantity}
                                onChange={(e) => updateProduct(line.productId, "quantity", parseInt(e.target.value) || 1)}
                              />
                            </td>
                            <td className="px-3 py-2 text-end">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                className="input w-20 py-1 text-end"
                                value={line.unitPrice}
                                onChange={(e) => updateProduct(line.productId, "unitPrice", parseFloat(e.target.value) || 0)}
                              />
                            </td>
                            <td className="px-3 py-2 text-end font-medium">{fmtCurrency(line.unitPrice * line.quantity)}</td>
                            <td className="px-3 py-2 text-end">
                              <button
                                type="button"
                                onClick={() => setProductCart((prev) => prev.filter((p) => p.productId !== line.productId))}
                                className="text-xs text-red-400 hover:text-red-600"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">{t("newVisit.summary")}</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <label className="label mb-0 flex-1">{t("newVisit.discountPercent")}</label>
              {discountUnlocked ? (
                <input type="number" min="0" max="100" step="1" className="input w-24 text-end"
                  value={discount} onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} />
              ) : (
                <button type="button" onClick={() => { setPinInput(""); setPinError(""); setPinModal(true); }}
                  className="btn-ghost text-xs px-3 py-1.5 border border-dashed border-gray-300">
                  🔒 {t("newVisit.unlockDiscount")}
                </button>
              )}
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
              <span>{fmtCurrency(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-sm text-red-500">
                <span>{t("field.discount")} ({discount}%)</span>
                <span>-{fmtCurrency(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-gray-900 pt-1">
              <span>{t("field.total")}</span>
              <span>{fmtCurrency(total)}</span>
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
            {submitting ? t("action.saving") : `${t("newVisit.saveVisit")} — ${fmtCurrency(total)}`}
          </button>
        </div>
      </form>

      {/* Discount PIN modal */}
      <Modal open={pinModal} onClose={() => setPinModal(false)} title={t("newVisit.discountPin")} size="sm">
        <form onSubmit={verifyPin} className="space-y-4">
          <p className="text-sm text-gray-600">{t("newVisit.discountPinHint")}</p>
          <input type="password" className="input text-center text-xl tracking-widest" value={pinInput}
            onChange={(e) => setPinInput(e.target.value)} placeholder="••••" autoFocus maxLength={20} />
          {pinError && <p className="text-red-500 text-sm text-center">{pinError}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => setPinModal(false)} className="btn-secondary flex-1">{t("action.cancel")}</button>
            <button type="submit" disabled={verifyingPin} className="btn-primary flex-1">
              {verifyingPin ? "…" : t("newVisit.unlockDiscount")}
            </button>
          </div>
        </form>
      </Modal>

      {/* New customer modal */}
      <Modal open={newCustModal} onClose={() => setNewCustModal(false)} title={t("customers.newCustomer")} size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">{t("field.name")} <span className="text-gray-400 font-normal">({t("field.optional")})</span></label>
            <input className="input" placeholder="Leave blank → Walk-in #" value={newCustForm.name}
              onChange={(e) => setNewCustForm({ ...newCustForm, name: e.target.value })} />
          </div>
          <div>
            <label className="label">{t("field.phone")} <span className="text-gray-400 font-normal">({t("field.optional")})</span></label>
            <input className="input" value={newCustForm.phone}
              onChange={(e) => setNewCustForm({ ...newCustForm, phone: e.target.value })} />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setNewCustModal(false)} className="btn-secondary flex-1">{t("action.cancel")}</button>
            <button type="button" onClick={createCustomer} className="btn-primary flex-1">
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
