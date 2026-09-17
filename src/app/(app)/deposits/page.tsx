"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Note } from "@/components/ui/Note";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { useTranslation } from "@/lib/i18n";

/**
 * Deposits: what the shop is waiting on, and what it is holding.
 *
 * "Held" is the figure to check against the bank — money that has arrived for
 * work that has not happened. It is deliberately outside the takings until the
 * customer sits down, and this screen is where that is said out loud.
 */

interface Deposit {
  id: string;
  startAt: string;
  status: string;
  totalPrice: number;
  depositAmount: number;
  depositStatus: string;
  depositRef: string | null;
  holdUntil: string | null;
  customer: { id: string; name: string; phone: string | null };
  barber: { name: string } | null;
  services: string[];
}

const TONE: Record<string, "yellow" | "green" | "blue" | "gray" | "red"> = {
  EXPECTED: "yellow",
  RECEIVED: "green",
  USED: "blue",
  REFUNDED: "gray",
  FORFEITED: "red",
};

export default function DepositsPage() {
  const { t, fmtCurrency, fmtDate, fmtDateTime } = useTranslation();
  const [data, setData] = useState<{ deposits: Deposit[]; summary: Record<string, number> } | null>(null);
  const [policy, setPolicy] = useState<{
    enabled: boolean;
    threshold: number;
    percent: number;
    holdHours: number;
    instapay: string | null;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    fetch("/api/deposits")
      .then((r) => r.json())
      .then((d) => setData(d?.deposits ? d : { deposits: [], summary: {} }))
      .catch(() => setData({ deposits: [], summary: {} }));
  }, []);

  useEffect(() => {
    load();
    fetch("/api/settings/deposits")
      .then((r) => r.json())
      .then(setPolicy)
      .catch(() => setPolicy(null));
  }, [load]);

  const act = async (deposit: Deposit, action: "received" | "refunded" | "forfeited") => {
    setBusyId(deposit.id);
    setError("");
    try {
      const res = await fetch(`/api/deposits/${deposit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) setError((await res.json())?.error ?? t("deposits.failed"));
      load();
    } finally {
      setBusyId(null);
    }
  };

  const savePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!policy) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/settings/deposits", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(policy),
      });
      const body = await res.json();
      if (res.ok) setPolicy(body);
      else setError(body?.error ?? t("deposits.failed"));
    } finally {
      setSaving(false);
    }
  };

  const waiting = (data?.deposits ?? []).filter((d) => d.depositStatus === "EXPECTED");
  const held = (data?.deposits ?? []).filter((d) => d.depositStatus === "RECEIVED");

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <PageHeader title={t("deposits.title")} subtitle={t("deposits.subtitle")} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(["held", "expected", "used", "forfeited"] as const).map((key) => (
          <div key={key} className="card p-4">
            <p className="text-xs text-gray-500">{t(`deposits.${key}` as "deposits.held")}</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums text-gray-900">
              {fmtCurrency(data?.summary?.[key] ?? 0)}
            </p>
          </div>
        ))}
      </div>

      <Note tone="info" title={t("deposits.noteTitle")}>
        {t("deposits.note")}
      </Note>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">{t("deposits.waiting")}</h2>
        {waiting.length === 0 ? (
          <p className="text-sm text-gray-500">{t("deposits.noneWaiting")}</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {waiting.map((deposit) => (
              <div key={deposit.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900">{deposit.customer.name}</div>
                  <div className="text-xs text-gray-500">
                    {fmtDate(deposit.startAt)} · {deposit.services.join(" + ")} · {deposit.customer.phone ?? "—"}
                  </div>
                  {deposit.holdUntil && (
                    <div className="mt-0.5 text-xs text-amber-600">
                      {t("deposits.holdUntil").replace("{when}", fmtDateTime(deposit.holdUntil))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-gray-500">{deposit.depositRef}</span>
                  <span className="font-semibold tabular-nums text-gray-900">{fmtCurrency(deposit.depositAmount)}</span>
                  <button
                    type="button"
                    disabled={busyId === deposit.id}
                    onClick={() => act(deposit, "received")}
                    className="btn-primary text-xs"
                  >
                    {t("deposits.markReceived")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">{t("deposits.holding")}</h2>
        {held.length === 0 ? (
          <EmptyState icon="💰" title={t("deposits.noneHeld")} />
        ) : (
          <div className="divide-y divide-gray-100">
            {held.map((deposit) => (
              <div key={deposit.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{deposit.customer.name}</span>
                    <Badge variant={TONE[deposit.depositStatus] ?? "gray"}>{deposit.status}</Badge>
                  </div>
                  <div className="text-xs text-gray-500">
                    {fmtDate(deposit.startAt)} · {deposit.services.join(" + ")}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold tabular-nums text-gray-900">{fmtCurrency(deposit.depositAmount)}</span>
                  <button
                    type="button"
                    disabled={busyId === deposit.id}
                    onClick={() => act(deposit, "refunded")}
                    className="btn-secondary text-xs"
                  >
                    {t("deposits.refund")}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === deposit.id}
                    onClick={() => act(deposit, "forfeited")}
                    className="btn-secondary text-xs"
                  >
                    {t("deposits.keep")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {policy && (
        <form onSubmit={savePolicy} className="card space-y-4 p-5">
          <h2 className="text-sm font-semibold text-gray-900">{t("deposits.policy")}</h2>

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={policy.enabled}
              onChange={(e) => setPolicy({ ...policy, enabled: e.target.checked })}
            />
            <span className="text-sm text-gray-700">{t("deposits.enabled")}</span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">{t("deposits.instapay")}</label>
              <input
                className="input"
                value={policy.instapay ?? ""}
                onChange={(e) => setPolicy({ ...policy, instapay: e.target.value })}
                placeholder="01X XXXX XXXX"
              />
              <p className="mt-1 text-xs text-gray-500">{t("deposits.instapayHint")}</p>
            </div>
            <div>
              <label className="label">{t("deposits.threshold")}</label>
              <input
                type="number"
                min="1"
                className="input"
                value={policy.threshold}
                onChange={(e) => setPolicy({ ...policy, threshold: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">{t("deposits.percent")}</label>
              <input
                type="number"
                min="1"
                max="100"
                className="input"
                value={policy.percent}
                onChange={(e) => setPolicy({ ...policy, percent: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">{t("deposits.holdHours")}</label>
              <input
                type="number"
                min="1"
                max="168"
                className="input"
                value={policy.holdHours}
                onChange={(e) => setPolicy({ ...policy, holdHours: Number(e.target.value) })}
              />
            </div>
          </div>

          <p className="text-xs text-gray-500">
            {t("deposits.preview")
              .replace("{threshold}", String(policy.threshold))
              .replace("{percent}", String(policy.percent))
              .replace("{example}", String(Math.round((policy.threshold * policy.percent) / 100)))
              .replace("{hours}", String(policy.holdHours))}
          </p>

          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? t("action.saving") : t("action.save")}
          </button>
        </form>
      )}
    </div>
  );
}
