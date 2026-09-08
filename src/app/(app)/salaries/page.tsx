"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { useTranslation } from "@/lib/i18n";
import { Note } from "@/components/ui/Note";
import { ExportButton } from "@/components/ui/ExportButton";

interface PenaltyRecord { id: string; date: string; amount: number; reason: string; }

interface AdvanceRecord { id: string; date: string; amount: number; paymentMethod: string; notes: string | null; }

interface BarberPayroll {
  barberId: string; name: string; barberPhone: string | null;
  baseSalary: number; commissionType: "PERCENT" | "FIXED_PER_VISIT"; commissionValue: number;
  visitCount: number; visitTotal: number; commissionableTotal: number; commission: number;
  gross: number; penaltiesTotal: number; penalties: PenaltyRecord[];
  advancesTotal: number; advances: AdvanceRecord[];
  absentDays: number; dailyRate: number; attendanceDeduction: number;
  net: number;
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

  const shareSalaryWhatsApp = (b: BarberPayroll) => {
    if (!b.barberPhone) return;
    const monthLabel = months[month - 1];
    const lines = [
      `*Escape Barbershop — Salary Slip*`,
      `📅 ${monthLabel} ${year}`,
      `👤 ${b.name}`,
      ``,
      `Base Salary: ${fmtCurrency(b.baseSalary)}`,
      `Commission: ${fmtCurrency(b.commission)}`,
      `*Gross: ${fmtCurrency(b.gross)}*`,
      ...(b.penaltiesTotal > 0 ? [`Penalties: -${fmtCurrency(b.penaltiesTotal)}`] : []),
      ...(b.advancesTotal > 0 ? [`Advances: -${fmtCurrency(b.advancesTotal)}`] : []),
      ...(b.absentDays > 0 ? [`Absence (${b.absentDays} days): -${fmtCurrency(b.attendanceDeduction)}`] : []),
      ``,
      `*Net Pay: ${fmtCurrency(b.net)}*`,
    ];
    const phone = b.barberPhone.replace(/\D/g, "");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
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
  const totalAdvances  = payroll.reduce((s, b) => s + b.advancesTotal, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title={t("salaries.title")}
        subtitle={t("salaries.subtitle")}
        action={
          <div className="flex gap-2">
            <ExportButton
              filename={`payroll-${year}-${String(month).padStart(2, "0")}.xlsx`}
              disabled={payroll.length === 0}
              build={() => [
                {
                  name: t("salaries.title"),
                  rows: payroll.map((b) => ({
                    [t("common.barber")]: b.name,
                    [t("salaries.visitCount")]: b.visitCount,
                    [t("salaries.visitRevenue")]: b.visitTotal,
                    [t("salaries.commissionableRevenue")]: b.commissionableTotal,
                    [t("salaries.base")]: b.baseSalary,
                    [t("salaries.commission")]: b.commission,
                    [t("salaries.gross")]: b.gross,
                    [t("salaries.penalties")]: -b.penaltiesTotal,
                    [t("salaries.advances")]: -b.advancesTotal,
                    [t("attendance.absentDays")]: b.absentDays,
                    [t("salaries.attendanceDeduction")]: -b.attendanceDeduction,
                    [t("salaries.net")]: b.net,
                  })),
                },
                {
                  name: t("salaries.penaltiesTitle"),
                  rows: payroll.flatMap((b) =>
                    b.penalties.map((p) => ({
                      [t("common.barber")]: b.name,
                      [t("field.date")]: fmtDate(p.date),
                      [t("field.amount")]: p.amount,
                      [t("field.reason")]: p.reason,
                    }))
                  ),
                },
                {
                  name: t("salaries.advancesTitle"),
                  rows: payroll.flatMap((b) =>
                    (b.advances ?? []).map((a) => ({
                      [t("common.barber")]: b.name,
                      [t("field.date")]: fmtDate(a.date),
                      [t("field.amount")]: a.amount,
                      [t("expenses.paidBy")]: a.paymentMethod === "CARD" ? t("common.card") : t("common.cash"),
                      [t("field.notes")]: a.notes ?? "",
                    }))
                  ),
                },
              ]}
            />
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
                <th className="text-end px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">{t("salaries.advances")}</th>
                <th className="text-end px-4 py-3 font-medium text-gray-600 hidden md:table-cell">{t("attendance.absentDays")}</th>
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
                        : `${fmtCurrency(b.commissionValue)}${t("barbers.perVisit")}`}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-end text-gray-600 hidden md:table-cell">{b.visitCount}</td>
                  <td className="px-4 py-3 text-end text-gray-600 hidden md:table-cell">{fmtCurrency(b.visitTotal)}</td>
                  <td className="px-4 py-3 text-end text-gray-700">{fmtCurrency(b.baseSalary)}</td>
                  <td className="px-4 py-3 text-end text-gray-700">{fmtCurrency(b.commission)}</td>
                  <td className="px-4 py-3 text-end font-semibold text-gray-900">{fmtCurrency(b.gross)}</td>
                  <td className="px-4 py-3 text-end hidden sm:table-cell">
                    {b.penaltiesTotal > 0 ? (
                      <button onClick={() => setDetailBarber(b)} className="text-red-600 hover:underline">
                        -{fmtCurrency(b.penaltiesTotal)}
                      </button>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-end hidden sm:table-cell">
                    {b.advancesTotal > 0 ? (
                      <button onClick={() => setDetailBarber(b)} className="text-amber-700 hover:underline">
                        -{fmtCurrency(b.advancesTotal)}
                      </button>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-end hidden md:table-cell">
                    {b.absentDays > 0 ? (
                      <span className="text-amber-600 font-medium">
                        {b.absentDays}d / -{fmtCurrency(b.attendanceDeduction)}
                      </span>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-end">
                    <span className={`font-bold ${b.net < 0 ? "text-red-600" : "text-green-700"}`}>
                      {fmtCurrency(b.net)}
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
                <td className="hidden md:table-cell" />
                <td className="px-4 py-3 text-end text-gray-900">{fmtCurrency(totalGross)}</td>
                <td className="px-4 py-3 text-end text-red-600 hidden sm:table-cell">-{fmtCurrency(totalPenalties)}</td>
                <td className="px-4 py-3 text-end text-amber-700 hidden sm:table-cell">-{fmtCurrency(totalAdvances)}</td>
                <td className="hidden md:table-cell" />
                <td className="px-4 py-3 text-end text-green-700">{fmtCurrency(totalNet)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {!loading && loaded && payroll.length > 0 && (
        <div className="mb-4">
          <Note tone="rule" title={t("note.salariesTitle")} icon="wallet">
            {t("note.salariesBody")}
          </Note>
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
                [t("salaries.visitRevenue"),         `${fmtCurrency(detailBarber.visitTotal)}`],
                [t("salaries.commissionableRevenue"), `${fmtCurrency(detailBarber.commissionableTotal)}`],
                [t("field.baseSalary"),              `${fmtCurrency(detailBarber.baseSalary)}`],
                [t("salaries.commission"),           `${fmtCurrency(detailBarber.commission)}`],
                [t("salaries.gross"),                `${fmtCurrency(detailBarber.gross)}`],
                [t("salaries.penalties"),            `-${fmtCurrency(detailBarber.penaltiesTotal)}`],
                [t("salaries.advances"),             `-${fmtCurrency(detailBarber.advancesTotal)}`],
                [t("salaries.attendanceDeduction"),  detailBarber.absentDays > 0 ? `-${fmtCurrency(detailBarber.attendanceDeduction)} (${detailBarber.absentDays}d)` : "—"],
              ].map(([label, value]) => (
                <div key={String(label)} className="bg-gray-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="font-semibold text-gray-900">{value}</p>
                </div>
              ))}
            </div>
            <div className="bg-primary-50 border border-primary-200 rounded-lg px-4 py-3 flex justify-between items-center">
              <span className="font-semibold text-primary-700">{t("salaries.netPay")}</span>
              <span className="text-xl font-bold text-primary-700">{fmtCurrency(detailBarber.net)}</span>
            </div>
            {detailBarber.barberPhone && (
              <button
                onClick={() => shareSalaryWhatsApp(detailBarber)}
                className="btn-secondary w-full text-sm"
              >
                💬 {t("salaries.shareWhatsapp")}
              </button>
            )}
            {detailBarber.advances?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">{t("salaries.advancesTitle")}</h3>
                <div className="space-y-2">
                  {detailBarber.advances.map((a) => (
                    <div key={a.id} className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-900">
                          {a.notes || (a.paymentMethod === "CARD" ? t("common.card") : t("common.cash"))}
                        </div>
                        <div className="text-xs text-gray-400">{fmtDate(a.date)}</div>
                      </div>
                      <Badge variant="yellow">{fmtCurrency(a.amount)}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                      <Badge variant="red">{fmtCurrency(p.amount)}</Badge>
                      <button onClick={() => deletePenalty(p.id)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

    </div>
  );
}
