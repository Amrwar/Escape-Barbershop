"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { useTranslation } from "@/lib/i18n";

interface PenaltyRecord { id: string; date: string; amount: number; reason: string; }

interface BarberPayroll {
  barberId: string; name: string;
  baseSalary: number; commissionType: "PERCENT" | "FIXED_PER_VISIT"; commissionValue: number;
  visitCount: number; visitTotal: number; commissionableTotal: number; commission: number;
  gross: number; penaltiesTotal: number; penalties: PenaltyRecord[]; net: number;
}

interface Barber { id: string; name: string; }

const MONTHS_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

export default function SalariesPage() {
  const { t, fmtCurrency, fmtDate, lang } = useTranslation();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());
  const [payroll, setPayroll] = useState<BarberPayroll[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded,  setLoaded]  = useState(false);

  const [penaltyModal, setPenaltyModal] = useState(false);
  const [penaltyBarbers, setPenaltyBarbers] = useState<Barber[]>([]);
  const [penaltyForm, setPenaltyForm] = useState({
    barberId: "", date: now.toISOString().slice(0, 10), amount: "", reason: "",
  });
  const [penaltyErrors, setPenaltyErrors] = useState<Record<string, string>>({});
  const [savingPenalty, setSavingPenalty] = useState(false);
  const [detailBarber, setDetailBarber] = useState<BarberPayroll | null>(null);
  const [pinModal, setPinModal] = useState(false);
  const [pinForm, setPinForm] = useState({ newPin: "", confirm: "" });
  const [pinError, setPinError] = useState("");
  const [savingPin, setSavingPin] = useState(false);

  const months = lang === "ar" ? MONTHS_AR : MONTHS_EN;
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  const loadPayroll = () => {
    setLoading(true);
    fetch(`/api/salaries?month=${month}&year=${year}`)
      .then((r) => r.json())
      .then((data) => { setPayroll(Array.isArray(data) ? data : []); setLoaded(true); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetch("/api/barbers?active=true")
      .then((r) => r.json())
      .then((data) => setPenaltyBarbers(Array.isArray(data) ? data : []));
  }, []);

  const openPenaltyModal = () => {
    setPenaltyForm({ barberId: "", date: now.toISOString().slice(0, 10), amount: "", reason: "" });
    setPenaltyErrors({});
    setPenaltyModal(true);
  };

  const savePenalty = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!penaltyForm.barberId) errs.barberId = "Required";
    if (!penaltyForm.amount || isNaN(parseFloat(penaltyForm.amount))) errs.amount = "Enter a valid amount";
    if (!penaltyForm.reason.trim()) errs.reason = "Required";
    if (Object.keys(errs).length) { setPenaltyErrors(errs); return; }
    setSavingPenalty(true);
    try {
      const res = await fetch("/api/penalties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...penaltyForm, amount: parseFloat(penaltyForm.amount) }),
      });
      if (res.ok) { setPenaltyModal(false); if (loaded) loadPayroll(); }
    } finally { setSavingPenalty(false); }
  };

  const savePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError("");
    if (pinForm.newPin.length < 4) { setPinError(t("salaries.pinTooShort")); return; }
    if (pinForm.newPin !== pinForm.confirm) { setPinError(t("salaries.pinMismatch")); return; }
    setSavingPin(true);
    try {
      const res = await fetch("/api/settings/discount-pin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinForm.newPin }),
      });
      if (res.ok) { setPinModal(false); setPinForm({ newPin: "", confirm: "" }); }
    } finally { setSavingPin(false); }
  };

  const deletePenalty = async (id: string) => {
    if (!confirm(t("salaries.confirmDelete"))) return;
    await fetch(`/api/penalties/${id}`, { method: "DELETE" });
    loadPayroll();
    setDetailBarber(null);
  };

  const totalGross     = payroll.reduce((s, b) => s + b.gross, 0);
  const totalNet       = payroll.reduce((s, b) => s + b.net, 0);
  const totalPenalties = payroll.reduce((s, b) => s + b.penaltiesTotal, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title={t("salaries.title")}
        subtitle={t("salaries.subtitle")}
        action={
          <div className="flex gap-2">
            <button onClick={() => { setPinForm({ newPin: "", confirm: "" }); setPinError(""); setPinModal(true); }} className="btn-ghost text-xs px-3 py-1.5">🔒 {t("salaries.changePin")}</button>
            <button onClick={openPenaltyModal} className="btn-secondary">{t("action.addPenalty")}</button>
          </div>
        }
      />

      {/* Period selector */}
      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">{t("field.month")}</label>
          <select className="input" value={month} onChange={(e) => setMonth(parseInt(e.target.value))}>
            {months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="label">{t("field.year")}</label>
          <select className="input" value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={loadPayroll} className="btn-primary">{t("action.generate")}</button>
      </div>

      {loading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="card p-4 animate-pulse h-20 bg-gray-100" />)}
        </div>
      )}

      {!loading && loaded && payroll.length === 0 && (
        <EmptyState icon="💰" title={t("salaries.noBarbers")} description={t("salaries.noBarberHint")} />
      )}

      {!loading && loaded && payroll.length > 0 && (
        <div className="card overflow-hidden mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="th-start px-4 py-3 font-medium text-gray-600">{t("common.barber")}</th>
                <th className="text-end px-4 py-3 font-medium text-gray-600 hidden md:table-cell">{t("salaries.visitCount")}</th>
                <th className="text-end px-4 py-3 font-medium text-gray-600 hidden md:table-cell">{t("salaries.revenue")}</th>
                <th className="text-end px-4 py-3 font-medium text-gray-600">{t("salaries.base")}</th>
                <th className="text-end px-4 py-3 font-medium text-gray-600">{t("salaries.commission")}</th>
                <th className="text-end px-4 py-3 font-medium text-gray-600">{t("salaries.gross")}</th>
                <th className="text-end px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">{t("salaries.penalties")}</th>
                <th className="text-end px-4 py-3 font-medium text-gray-600">{t("salaries.net")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payroll.map((b) => (
                <tr key={b.barberId} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{b.name}</div>
                    <div className="text-xs text-gray-400">
                      {b.commissionType === "PERCENT"
                        ? `${b.commissionValue}% ${t("barbers.commission")}`
                        : `$${fmtCurrency(b.commissionValue)}${t("barbers.perVisit")}`}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-end text-gray-600 hidden md:table-cell">{b.visitCount}</td>
                  <td className="px-4 py-3 text-end text-gray-600 hidden md:table-cell">${fmtCurrency(b.visitTotal)}</td>
                  <td className="px-4 py-3 text-end text-gray-700">${fmtCurrency(b.baseSalary)}</td>
                  <td className="px-4 py-3 text-end text-gray-700">${fmtCurrency(b.commission)}</td>
                  <td className="px-4 py-3 text-end font-semibold text-gray-900">${fmtCurrency(b.gross)}</td>
                  <td className="px-4 py-3 text-end hidden sm:table-cell">
                    {b.penaltiesTotal > 0 ? (
                      <button onClick={() => setDetailBarber(b)} className="text-red-600 hover:underline">
                        -${fmtCurrency(b.penaltiesTotal)}
                      </button>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-end">
                    <span className={`font-bold ${b.net < 0 ? "text-red-600" : "text-green-700"}`}>
                      ${fmtCurrency(b.net)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-end">
                    <button onClick={() => setDetailBarber(b)} className="btn-ghost text-xs px-2 py-1">{t("action.detail")}</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                <td className="px-4 py-3 text-gray-900">{t("salaries.totals")}</td>
                <td colSpan={4} className="hidden md:table-cell" />
                <td className="px-4 py-3 text-end text-gray-900">${fmtCurrency(totalGross)}</td>
                <td className="px-4 py-3 text-end text-red-600 hidden sm:table-cell">-${fmtCurrency(totalPenalties)}</td>
                <td className="px-4 py-3 text-end text-green-700">${fmtCurrency(totalNet)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Penalty modal */}
      <Modal open={penaltyModal} onClose={() => setPenaltyModal(false)} title={t("salaries.addPenaltyTitle")} size="sm">
        <form onSubmit={savePenalty} className="space-y-4">
          <div>
            <label className="label">{t("common.barber")}</label>
            <select className="input" value={penaltyForm.barberId}
              onChange={(e) => setPenaltyForm({ ...penaltyForm, barberId: e.target.value })}>
              <option value="">{t("newVisit.selectBarber")}</option>
              {penaltyBarbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            {penaltyErrors.barberId && <p className="text-red-500 text-xs mt-1">{penaltyErrors.barberId}</p>}
          </div>
          <div>
            <label className="label">{t("field.date")}</label>
            <input type="date" className="input" value={penaltyForm.date}
              onChange={(e) => setPenaltyForm({ ...penaltyForm, date: e.target.value })} />
          </div>
          <div>
            <label className="label">{t("field.amount")} ($)</label>
            <input type="number" min="0.01" step="0.01" className="input" value={penaltyForm.amount}
              onChange={(e) => setPenaltyForm({ ...penaltyForm, amount: e.target.value })} placeholder="0.00" />
            {penaltyErrors.amount && <p className="text-red-500 text-xs mt-1">{penaltyErrors.amount}</p>}
          </div>
          <div>
            <label className="label">{t("field.reason")}</label>
            <textarea className="input resize-none" rows={2} value={penaltyForm.reason}
              onChange={(e) => setPenaltyForm({ ...penaltyForm, reason: e.target.value })} />
            {penaltyErrors.reason && <p className="text-red-500 text-xs mt-1">{penaltyErrors.reason}</p>}
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setPenaltyModal(false)} className="btn-secondary flex-1">{t("action.cancel")}</button>
            <button type="submit" disabled={savingPenalty} className="btn-danger flex-1">
              {savingPenalty ? t("action.saving") : t("salaries.addPenaltyTitle")}
            </button>
          </div>
        </form>
      </Modal>

      {/* Detail modal */}
      {detailBarber && (
        <Modal open={!!detailBarber} onClose={() => setDetailBarber(null)}
          title={`${detailBarber.name} — ${months[month - 1]} ${year}`} size="lg">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                [t("salaries.visitCount"),          detailBarber.visitCount],
                [t("salaries.visitRevenue"),         `$${fmtCurrency(detailBarber.visitTotal)}`],
                [t("salaries.commissionableRevenue"), `$${fmtCurrency(detailBarber.commissionableTotal)}`],
                [t("field.baseSalary"),              `$${fmtCurrency(detailBarber.baseSalary)}`],
                [t("salaries.commission"),           `$${fmtCurrency(detailBarber.commission)}`],
                [t("salaries.gross"),                `$${fmtCurrency(detailBarber.gross)}`],
                [t("salaries.penalties"),            `-$${fmtCurrency(detailBarber.penaltiesTotal)}`],
              ].map(([label, value]) => (
                <div key={String(label)} className="bg-gray-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="font-semibold text-gray-900">{value}</p>
                </div>
              ))}
            </div>
            <div className="bg-primary-50 border border-primary-200 rounded-lg px-4 py-3 flex justify-between items-center">
              <span className="font-semibold text-primary-700">{t("salaries.netPay")}</span>
              <span className="text-xl font-bold text-primary-700">${fmtCurrency(detailBarber.net)}</span>
            </div>
            {detailBarber.penalties.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">{t("salaries.penaltiesTitle")}</h3>
                <div className="space-y-2">
                  {detailBarber.penalties.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-900">{p.reason}</div>
                        <div className="text-xs text-gray-400">{fmtDate(p.date)}</div>
                      </div>
                      <Badge variant="red">${fmtCurrency(p.amount)}</Badge>
                      <button onClick={() => deletePenalty(p.id)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Change Discount PIN modal */}
      <Modal open={pinModal} onClose={() => setPinModal(false)} title={t("salaries.changePin")} size="sm">
        <form onSubmit={savePin} className="space-y-4">
          <div>
            <label className="label">{t("salaries.newPin")}</label>
            <input type="password" className="input" value={pinForm.newPin}
              onChange={(e) => setPinForm({ ...pinForm, newPin: e.target.value })}
              placeholder="••••" minLength={4} />
          </div>
          <div>
            <label className="label">{t("salaries.confirmPin")}</label>
            <input type="password" className="input" value={pinForm.confirm}
              onChange={(e) => setPinForm({ ...pinForm, confirm: e.target.value })}
              placeholder="••••" minLength={4} />
          </div>
          {pinError && <p className="text-red-500 text-sm">{pinError}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setPinModal(false)} className="btn-secondary flex-1">{t("action.cancel")}</button>
            <button type="submit" disabled={savingPin} className="btn-primary flex-1">
              {savingPin ? t("action.saving") : t("action.save")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
