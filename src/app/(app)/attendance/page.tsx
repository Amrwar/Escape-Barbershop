"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EditPinModal } from "@/components/ui/EditPinModal";
import { useTranslation } from "@/lib/i18n";

interface SalarySettings {
  baseSalary: number;
}

interface Barber {
  id: string;
  name: string;
  salarySettings: SalarySettings | null;
}

const MONTHS_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

function toDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function AttendancePage() {
  const { t, fmtCurrency, lang } = useTranslation();
  const { data: session } = useSession();
  const isOwner = session?.user?.role === "OWNER";

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [absentMap, setAbsentMap] = useState<Record<string, string[]>>({});
  const [toggling, setToggling] = useState<string | null>(null);

  // PIN modal
  const [pinModal, setPinModal] = useState<{ open: boolean; onConfirm: () => void }>({
    open: false,
    onConfirm: () => {},
  });

  const withPin = (action: () => void) => {
    if (isOwner) { action(); return; }
    setPinModal({ open: true, onConfirm: action });
  };

  const months = lang === "ar" ? MONTHS_AR : MONTHS_EN;
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);
  const daysInMonth = new Date(year, month, 0).getDate();

  const loadAttendance = useCallback(() => {
    fetch(`/api/attendance?month=${month}&year=${year}`)
      .then((r) => r.json())
      .then((data) => setAbsentMap(typeof data === "object" && data !== null ? data : {}));
  }, [month, year]);

  useEffect(() => {
    fetch("/api/barbers?active=true")
      .then((r) => r.json())
      .then((data) => setBarbers(Array.isArray(data) ? data : []));
  }, []);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  const doToggle = async (barberId: string, dateStr: string) => {
    const key = `${barberId}|${dateStr}`;
    if (toggling === key) return;
    setToggling(key);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barberId, date: dateStr }),
      });
      if (res.ok) {
        const { absent } = await res.json();
        setAbsentMap((prev) => {
          const current = prev[barberId] ?? [];
          if (absent) {
            return { ...prev, [barberId]: [...current, dateStr] };
          } else {
            return { ...prev, [barberId]: current.filter((d) => d !== dateStr) };
          }
        });
      }
    } finally {
      setToggling(null);
    }
  };

  const toggleDay = (barberId: string, dateStr: string) => {
    withPin(() => doToggle(barberId, dateStr));
  };

  const todayStr = toDateStr(now.getFullYear(), now.getMonth() + 1, now.getDate());

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title={t("attendance.title")}
        subtitle={t("attendance.subtitle")}
      />

      {/* Period selector */}
      <div className="card p-4 mb-6 flex flex-wrap gap-3 items-end">
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
      </div>

      {/* Barber cards */}
      <div className="space-y-4">
        {barbers.map((barber) => {
          const absentDates = absentMap[barber.id] ?? [];
          const absentDays = absentDates.length;
          const baseSalary = barber.salarySettings?.baseSalary ?? 0;
          const dailyRate = baseSalary / 30;
          const deduction = absentDays * dailyRate;

          return (
            <div key={barber.id} className="card p-4">
              {/* Barber header */}
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="font-semibold text-gray-900">{barber.name}</div>
                <div className="flex flex-wrap gap-3 text-sm">
                  <span className="text-gray-500">
                    {t("attendance.absentDays")}:{" "}
                    <span className={absentDays > 0 ? "text-red-600 font-semibold" : "text-gray-700"}>
                      {absentDays}
                    </span>
                  </span>
                  <span className="text-gray-500">
                    {t("attendance.dailyRate")}:{" "}
                    <span className="text-gray-700">{fmtCurrency(dailyRate)}</span>
                  </span>
                  {absentDays > 0 && (
                    <span className="text-amber-600 font-semibold">
                      {t("attendance.deduction")}: -{fmtCurrency(deduction)}
                    </span>
                  )}
                </div>
              </div>

              {/* Day buttons */}
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const dateStr = toDateStr(year, month, day);
                  const isAbsent = absentDates.includes(dateStr);
                  const isFuture = dateStr > todayStr;
                  const key = `${barber.id}|${dateStr}`;
                  const isToggling = toggling === key;

                  return (
                    <button
                      key={day}
                      disabled={isFuture || isToggling}
                      onClick={() => toggleDay(barber.id, dateStr)}
                      title={dateStr}
                      className={`
                        w-8 h-8 rounded text-xs font-medium transition-colors
                        ${isFuture
                          ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                          : isAbsent
                          ? "bg-red-500 text-white hover:bg-red-600"
                          : "bg-green-100 text-green-700 hover:bg-green-200"
                        }
                        ${isToggling ? "opacity-50" : ""}
                      `}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {barbers.length === 0 && (
          <div className="card p-8 text-center text-gray-400">
            {t("salaries.noBarbers")}
          </div>
        )}
      </div>

      <EditPinModal
        open={pinModal.open}
        onSuccess={() => { setPinModal((p) => ({ ...p, open: false })); pinModal.onConfirm(); }}
        onClose={() => setPinModal((p) => ({ ...p, open: false }))}
      />
    </div>
  );
}
