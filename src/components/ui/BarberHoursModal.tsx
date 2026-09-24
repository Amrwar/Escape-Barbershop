"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useTranslation } from "@/lib/i18n";
import type { TranslationKey } from "../../../messages/en";

/**
 * When one barber actually works.
 *
 * Their hours narrow the shop's and never widen them, which is the rule the
 * slot maths already enforces — so the worst a mistake here can do is offer a
 * customer less time, never more.
 *
 * "Same as the shop" is the default and clears the rota rather than writing
 * seven rows that happen to match: a barber with no rows follows the shop's
 * hours forever, including after the shop changes them.
 */

const WEEKDAYS: TranslationKey[] = [
  "booking.sunday",
  "booking.monday",
  "booking.tuesday",
  "booking.wednesday",
  "booking.thursday",
  "booking.friday",
  "booking.saturday",
];

interface Day {
  weekday: number;
  startMinute: number;
  endMinute: number;
  isWorking: boolean;
}

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMinutes = (v: string) => {
  const [h, m] = v.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

export function BarberHoursModal({
  barber,
  shopHours,
  onClose,
}: {
  barber: { id: string; name: string } | null;
  shopHours: { weekday: number; startMinute: number; endMinute: number; isOpen?: boolean }[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [days, setDays] = useState<Day[] | null>(null);
  const [custom, setCustom] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!barber) return;
    setError("");
    setDays(null);

    fetch(`/api/barbers/${barber.id}/hours`)
      .then((r) => r.json())
      .then((d) => {
        const rows: Day[] = Array.isArray(d?.hours) ? d.hours : [];
        setCustom(rows.length > 0);
        setDays(
          [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
            const own = rows.find((r) => r.weekday === weekday);
            const shop = shopHours.find((h) => h.weekday === weekday);
            return {
              weekday,
              startMinute: own?.startMinute ?? shop?.startMinute ?? 9 * 60,
              endMinute: own?.endMinute ?? shop?.endMinute ?? 24 * 60,
              isWorking: own ? own.isWorking !== false : shop?.isOpen !== false,
            };
          })
        );
      })
      .catch(() => setError(t("barbers.hoursFailed")));
  }, [barber, shopHours, t]);

  const patch = (weekday: number, change: Partial<Day>) =>
    setDays((prev) => prev?.map((d) => (d.weekday === weekday ? { ...d, ...change } : d)) ?? prev);

  const save = async () => {
    if (!barber || !days) return;
    setSaving(true);
    setError("");
    try {
      const res = custom
        ? await fetch(`/api/barbers/${barber.id}/hours`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hours: days }),
          })
        : await fetch(`/api/barbers/${barber.id}/hours`, { method: "DELETE" });

      if (!res.ok) {
        setError((await res.json())?.error ?? t("barbers.hoursFailed"));
        return;
      }
      onClose();
    } catch {
      setError(t("barbers.hoursFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={!!barber} onClose={onClose} title={barber ? `${barber.name} — ${t("barbers.hours")}` : ""} size="md">
      {!days ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-9 animate-pulse rounded bg-gray-100" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            {[false, true].map((isCustom) => (
              <label key={String(isCustom)} className="flex cursor-pointer items-start gap-3">
                <input
                  type="radio"
                  name="hoursMode"
                  checked={custom === isCustom}
                  onChange={() => setCustom(isCustom)}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-medium text-gray-900">
                    {t(isCustom ? "barbers.hoursOwn" : "barbers.hoursShop")}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {t(isCustom ? "barbers.hoursOwnHint" : "barbers.hoursShopHint")}
                  </span>
                </span>
              </label>
            ))}
          </div>

          {custom && (
            <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
              {days.map((day) => {
                const shop = shopHours.find((h) => h.weekday === day.weekday);
                const shopShut = shop?.isOpen === false;
                return (
                  <div key={day.weekday} className="flex flex-wrap items-center gap-3 px-3 py-2">
                    <label className="flex w-32 shrink-0 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={day.isWorking && !shopShut}
                        disabled={shopShut}
                        onChange={(e) => patch(day.weekday, { isWorking: e.target.checked })}
                        className="rounded border-gray-300"
                      />
                      <span className={`text-sm ${shopShut ? "text-gray-400" : "text-gray-900"}`}>
                        {t(WEEKDAYS[day.weekday])}
                      </span>
                    </label>

                    {shopShut ? (
                      <span className="text-xs text-gray-400">{t("barbers.hoursShopClosed")}</span>
                    ) : day.isWorking ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          value={hhmm(day.startMinute)}
                          onChange={(e) => patch(day.weekday, { startMinute: toMinutes(e.target.value) })}
                          className="input w-28 py-1 text-sm"
                        />
                        <span className="text-gray-400">–</span>
                        <input
                          type="time"
                          value={day.endMinute === 24 * 60 ? "23:59" : hhmm(day.endMinute)}
                          onChange={(e) => patch(day.weekday, { endMinute: toMinutes(e.target.value) })}
                          className="input w-28 py-1 text-sm"
                        />
                        {shop && (
                          <span className="text-xs text-gray-400">
                            {t("barbers.hoursShopIs")} {hhmm(shop.startMinute)}–
                            {shop.endMinute === 24 * 60 ? "00:00" : hhmm(shop.endMinute)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">{t("barbers.hoursOff")}</span>
                    )}
                  </div>
                );
              })}
              <p className="px-3 py-2 text-xs text-gray-500">{t("barbers.hoursNarrowOnly")}</p>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              {t("action.cancel")}
            </button>
            <button type="button" onClick={save} disabled={saving} className="btn-primary flex-1">
              {saving ? "…" : t("action.save")}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
