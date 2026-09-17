"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Note } from "@/components/ui/Note";
import { useTranslation } from "@/lib/i18n";

/**
 * When the shop is open, and the rules the booking calendar follows. Everything
 * here feeds the free-slot maths, so a change is visible to customers at once.
 */

interface DayHours {
  weekday: number;
  startMinute: number;
  endMinute: number;
  isOpen: boolean;
}

interface Settings {
  slotMinutes: number;
  minNoticeMinutes: number;
  maxDaysAhead: number;
  bufferMinutes: number;
  cancelWindowMinutes: number;
  onlineBookingEnabled: boolean;
  rebookingRemindersEnabled: boolean;
  timezone: string;
}

const WEEKDAY_KEYS = [
  "booking.sunday",
  "booking.monday",
  "booking.tuesday",
  "booking.wednesday",
  "booking.thursday",
  "booking.friday",
  "booking.saturday",
] as const;

const toTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const toMinutes = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export default function BookingSettingsPage() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [hours, setHours] = useState<DayHours[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/booking/settings")
      .then((r) => r.json())
      .then((d) => {
        setSettings(d.settings);
        const byDay: DayHours[] = [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
          const row = (d.hours as DayHours[]).find((h) => h.weekday === weekday);
          return row ?? { weekday, startMinute: 11 * 60, endMinute: 23 * 60, isOpen: false };
        });
        setHours(byDay);
      })
      .finally(() => setLoading(false));
  }, []);

  const patchDay = (weekday: number, patch: Partial<DayHours>) =>
    setHours((prev) => prev.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/booking/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            slotMinutes: settings.slotMinutes,
            minNoticeMinutes: settings.minNoticeMinutes,
            maxDaysAhead: settings.maxDaysAhead,
            bufferMinutes: settings.bufferMinutes,
            cancelWindowMinutes: settings.cancelWindowMinutes,
            onlineBookingEnabled: settings.onlineBookingEnabled,
          },
          hours,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        setError((await res.json()).error ?? t("appointments.actionFailed"));
      }
    } catch {
      setError(t("appointments.networkError"));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse" />
        <div className="card h-64 animate-pulse bg-gray-100" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <PageHeader title={t("booking.title")} subtitle={t("booking.subtitle")} />

      <div className="card p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">{t("booking.openingHours")}</h2>
        <div className="space-y-2">
          {hours.map((day) => (
            <div key={day.weekday} className="flex flex-wrap items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
              <label className="flex items-center gap-2 w-40 shrink-0">
                <input
                  type="checkbox"
                  checked={day.isOpen}
                  onChange={(e) => patchDay(day.weekday, { isOpen: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium text-gray-900">{t(WEEKDAY_KEYS[day.weekday])}</span>
              </label>

              {day.isOpen ? (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-xs text-gray-500">{t("booking.opens")}</span>
                  <input
                    type="time"
                    className="input w-32 py-1.5"
                    value={toTime(day.startMinute)}
                    onChange={(e) => patchDay(day.weekday, { startMinute: toMinutes(e.target.value) })}
                  />
                  <span className="text-xs text-gray-500">{t("booking.closes")}</span>
                  <input
                    type="time"
                    className="input w-32 py-1.5"
                    value={toTime(day.endMinute)}
                    onChange={(e) => patchDay(day.weekday, { endMinute: toMinutes(e.target.value) })}
                  />
                </div>
              ) : (
                <span className="text-sm text-gray-400">{t("booking.closed")}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">{t("booking.rules")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <NumberField
            label={t("booking.slotMinutes")}
            hint={t("booking.slotMinutesHint")}
            value={settings.slotMinutes}
            min={5}
            max={120}
            onChange={(slotMinutes) => setSettings({ ...settings, slotMinutes })}
          />
          <NumberField
            label={t("booking.buffer")}
            hint={t("booking.bufferHint")}
            value={settings.bufferMinutes}
            min={0}
            max={120}
            onChange={(bufferMinutes) => setSettings({ ...settings, bufferMinutes })}
          />
          <NumberField
            label={t("booking.minNotice")}
            hint={t("booking.minNoticeHint")}
            value={settings.minNoticeMinutes}
            min={0}
            max={10080}
            onChange={(minNoticeMinutes) => setSettings({ ...settings, minNoticeMinutes })}
          />
          <NumberField
            label={t("booking.cancelWindow")}
            hint={t("booking.cancelWindowHint")}
            value={settings.cancelWindowMinutes}
            min={0}
            max={10080}
            onChange={(cancelWindowMinutes) => setSettings({ ...settings, cancelWindowMinutes })}
          />
          <NumberField
            label={t("booking.maxDaysAhead")}
            hint={t("booking.maxDaysAheadHint")}
            value={settings.maxDaysAhead}
            min={1}
            max={365}
            onChange={(maxDaysAhead) => setSettings({ ...settings, maxDaysAhead })}
          />
        </div>

        <label className="flex items-center gap-2 mt-4">
          <input
            type="checkbox"
            checked={settings.onlineBookingEnabled}
            onChange={(e) => setSettings({ ...settings, onlineBookingEnabled: e.target.checked })}
            className="w-4 h-4"
          />
          <span className="text-sm text-gray-700">{t("booking.onlineEnabled")}</span>
        </label>

        <label className="flex items-start gap-2 mt-3">
          <input
            type="checkbox"
            checked={settings.rebookingRemindersEnabled}
            onChange={(e) => setSettings({ ...settings, rebookingRemindersEnabled: e.target.checked })}
            className="mt-0.5 w-4 h-4"
          />
          <span className="text-sm text-gray-700">
            {t("booking.rebookingEnabled")}
            <span className="block text-xs text-gray-500">{t("booking.rebookingHint")}</span>
          </span>
        </label>
      </div>

      <Note tone="info" title={t("booking.title")} icon="calendar">
        {t("booking.hoursNote")}
      </Note>

      {error && <div className="mt-4 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">{error}</div>}

      <div className="mt-6 flex items-center gap-3">
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? t("action.saving") : t("action.save")}
        </button>
        {saved && <span className="text-sm text-green-600">{t("booking.saved")}</span>}
      </div>
    </div>
  );
}

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label className="label mb-0.5">{label}</label>
      <input
        type="number"
        className="input"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, parseInt(e.target.value, 10) || 0)))}
      />
      <p className="text-xs text-gray-400 mt-1">{hint}</p>
    </div>
  );
}
