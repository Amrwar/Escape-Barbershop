"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { useTranslation } from "@/lib/i18n";

interface Movement {
  id: string;
  type: "IN" | "OUT";
  amount: number;
  reason: string;
  createdAt: string;
  createdBy: { name: string };
}

interface SessionData {
  id: string;
  openedAt: string;
  openingCash: number;
  status: "OPEN" | "CLOSED";
  openedBy: { name: string };
  movements: Movement[];
  visitSummary: {
    cashTotal: number;
    cardTotal: number;
    mixedCash: number;
    visitCount: number;
    cashSales: number;
    cashIn: number;
    cashOut: number;
    expectedCash: number;
  };
}

interface RecentSession {
  id: string;
  openedAt: string;
  closedAt: string | null;
  status: "OPEN" | "CLOSED";
  openingCash: number;
  closingCashCounted: number | null;
  openedBy: { name: string };
}

export default function CashDrawerPage() {
  const { data: authSession } = useSession();
  const isOwner = authSession?.user?.role === "OWNER";
  const { t, fmtCurrency } = useTranslation();

  const [session, setSession] = useState<SessionData | null | undefined>(undefined);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [loading, setLoading] = useState(true);

  // Open drawer state
  const [openModal, setOpenModal] = useState(false);
  const [openingCash, setOpeningCash] = useState(0);
  const [openNotes, setOpenNotes] = useState("");
  const [openSubmitting, setOpenSubmitting] = useState(false);
  const [openError, setOpenError] = useState("");

  // Movement state
  const [movementModal, setMovementModal] = useState(false);
  const [movementType, setMovementType] = useState<"IN" | "OUT">("IN");
  const [movementAmount, setMovementAmount] = useState(0);
  const [movementReason, setMovementReason] = useState("");
  const [movementSubmitting, setMovementSubmitting] = useState(false);
  const [movementError, setMovementError] = useState("");

  // Close state
  const [closeModal, setCloseModal] = useState(false);
  const [closingCash, setClosingCash] = useState(0);
  const [closeNotes, setCloseNotes] = useState("");
  const [closeSubmitting, setCloseSubmitting] = useState(false);
  const [closeError, setCloseError] = useState("");

  const fetchSession = useCallback(async () => {
    const res = await fetch("/api/cash-drawer");
    const data = await res.json();
    setSession(data);
  }, []);

  const fetchSessions = useCallback(async () => {
    const res = await fetch("/api/cash-drawer/sessions");
    const data = await res.json();
    setRecentSessions(Array.isArray(data) ? data.slice(0, 5) : []);
  }, []);

  useEffect(() => {
    Promise.all([fetchSession(), fetchSessions()]).finally(() =>
      setLoading(false)
    );
  }, [fetchSession, fetchSessions]);

  const handleOpenDrawer = async () => {
    setOpenSubmitting(true);
    setOpenError("");
    try {
      const res = await fetch("/api/cash-drawer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openingCash, notes: openNotes }),
      });
      if (res.ok) {
        setOpenModal(false);
        setOpeningCash(0);
        setOpenNotes("");
        await fetchSession();
        await fetchSessions();
      } else {
        const d = await res.json();
        setOpenError(d.error ?? "Failed");
      }
    } finally {
      setOpenSubmitting(false);
    }
  };

  const handleAddMovement = async () => {
    setMovementSubmitting(true);
    setMovementError("");
    try {
      const res = await fetch("/api/cash-drawer/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: movementType,
          amount: movementAmount,
          reason: movementReason,
        }),
      });
      if (res.ok) {
        setMovementModal(false);
        setMovementAmount(0);
        setMovementReason("");
        await fetchSession();
      } else {
        const d = await res.json();
        setMovementError(d.error ?? "Failed");
      }
    } finally {
      setMovementSubmitting(false);
    }
  };

  const handleCloseDrawer = async () => {
    setCloseSubmitting(true);
    setCloseError("");
    try {
      const res = await fetch("/api/cash-drawer/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          closingCashCounted: closingCash,
          notes: closeNotes,
        }),
      });
      if (res.ok) {
        setCloseModal(false);
        setClosingCash(0);
        setCloseNotes("");
        await fetchSession();
        await fetchSessions();
      } else {
        const d = await res.json();
        setCloseError(d.error ?? "Failed");
      }
    } finally {
      setCloseSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-100 rounded w-1/3" />
          <div className="h-48 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  const difference =
    session && closeModal
      ? closingCash - session.visitSummary.expectedCash
      : null;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeader
        title={t("cashDrawer.title")}
        subtitle={t("cashDrawer.subtitle")}
      />

      {/* No open session */}
      {!session && (
        <div className="space-y-6">
          <div className="card p-8 text-center">
            <div className="text-4xl mb-3">🗃️</div>
            <p className="text-gray-500 mb-6">{t("cashDrawer.noOpenSession")}</p>
            {isOwner && (
              <button
                onClick={() => setOpenModal(true)}
                className="btn-primary"
              >
                {t("cashDrawer.openDrawer")}
              </button>
            )}
          </div>

          {/* Recent sessions list */}
          {recentSessions.length > 0 && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">
                {t("cashDrawer.recentSession")}
              </h2>
              <div className="space-y-2">
                {recentSessions.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {new Date(s.openedAt).toLocaleDateString()} —{" "}
                        {s.openedBy.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        Opening: ${fmtCurrency(s.openingCash)}
                        {s.closingCashCounted !== null &&
                          ` · Counted: $${fmtCurrency(s.closingCashCounted)}`}
                      </div>
                    </div>
                    <Link
                      href={`/cash-drawer/report/${s.id}`}
                      className="btn-secondary text-xs"
                    >
                      {t("cashDrawer.viewReport")}
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Open session */}
      {session && (
        <div className="space-y-6">
          {/* Session summary */}
          <div className="card p-5 border-2 border-green-200 bg-green-50">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-gray-900">
                    {t("cashDrawer.openedAt")}:{" "}
                    {new Date(session.openedAt).toLocaleString()}
                  </h2>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-200 text-green-800">
                    {t("cashDrawer.sessionOpen")}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {t("cashDrawer.openedBy")}: {session.openedBy.name}
                </p>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>{t("cashDrawer.openingBalance")}</span>
                <span>${fmtCurrency(session.openingCash)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>
                  {t("cashDrawer.cashSales")} ({session.visitSummary.visitCount}{" "}
                  visits)
                </span>
                <span className="text-green-700">
                  +${fmtCurrency(session.visitSummary.cashSales)}
                </span>
              </div>
              {session.visitSummary.cashIn > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>{t("cashDrawer.cashIn")}</span>
                  <span className="text-green-700">
                    +${fmtCurrency(session.visitSummary.cashIn)}
                  </span>
                </div>
              )}
              {session.visitSummary.cashOut > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>{t("cashDrawer.cashOut")}</span>
                  <span className="text-red-600">
                    -${fmtCurrency(session.visitSummary.cashOut)}
                  </span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base text-gray-900 pt-2 border-t border-green-200">
                <span>{t("cashDrawer.expectedCash")}</span>
                <span className="text-green-700">
                  ${fmtCurrency(session.visitSummary.expectedCash)}
                </span>
              </div>
            </div>
          </div>

          {/* Movements */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">
              {t("cashDrawer.movements")}
            </h2>
            {session.movements.length === 0 ? (
              <p className="text-sm text-gray-400">
                {t("cashDrawer.noMovements")}
              </p>
            ) : (
              <div className="space-y-2">
                {session.movements.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          m.type === "IN"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {m.type}
                      </span>
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {m.reason}
                        </div>
                        <div className="text-xs text-gray-400">
                          {m.createdBy.name} ·{" "}
                          {new Date(m.createdAt).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`text-sm font-semibold ${
                        m.type === "IN" ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {m.type === "IN" ? "+" : "-"}${fmtCurrency(m.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Owner actions */}
          {isOwner && (
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => {
                  setMovementType("IN");
                  setMovementModal(true);
                }}
                className="btn-secondary text-sm text-green-700 border-green-300"
              >
                {t("cashDrawer.addCashIn")}
              </button>
              <button
                onClick={() => {
                  setMovementType("OUT");
                  setMovementModal(true);
                }}
                className="btn-secondary text-sm text-red-700 border-red-300"
              >
                {t("cashDrawer.addCashOut")}
              </button>
              <div className="flex-1" />
              <button
                onClick={() => {
                  setClosingCash(
                    parseFloat(
                      session.visitSummary.expectedCash.toFixed(2)
                    )
                  );
                  setCloseModal(true);
                }}
                className="btn-primary"
              >
                {t("cashDrawer.closeDayTitle")}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Open Drawer Modal */}
      <Modal
        open={openModal}
        onClose={() => setOpenModal(false)}
        title={t("cashDrawer.openDrawer")}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="label">{t("cashDrawer.openingCash")}</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input"
              value={openingCash}
              onChange={(e) => setOpeningCash(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className="label">
              {t("field.notes")}{" "}
              <span className="text-gray-400 font-normal">
                ({t("field.optional")})
              </span>
            </label>
            <input
              className="input"
              value={openNotes}
              onChange={(e) => setOpenNotes(e.target.value)}
            />
          </div>
          {openError && (
            <p className="text-sm text-red-600">{openError}</p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setOpenModal(false)}
              className="btn-secondary flex-1"
            >
              {t("action.cancel")}
            </button>
            <button
              type="button"
              onClick={handleOpenDrawer}
              disabled={openSubmitting}
              className="btn-primary flex-1"
            >
              {openSubmitting ? t("action.saving") : t("cashDrawer.openDrawer")}
            </button>
          </div>
        </div>
      </Modal>

      {/* Movement Modal */}
      <Modal
        open={movementModal}
        onClose={() => setMovementModal(false)}
        title={t("cashDrawer.addMovementTitle")}
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setMovementType("IN")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                movementType === "IN"
                  ? "bg-green-100 border-green-400 text-green-800"
                  : "border-gray-200 text-gray-600"
              }`}
            >
              {t("cashDrawer.addCashIn")}
            </button>
            <button
              type="button"
              onClick={() => setMovementType("OUT")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                movementType === "OUT"
                  ? "bg-red-100 border-red-400 text-red-800"
                  : "border-gray-200 text-gray-600"
              }`}
            >
              {t("cashDrawer.addCashOut")}
            </button>
          </div>
          <div>
            <label className="label">{t("field.amount")}</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              className="input"
              value={movementAmount}
              onChange={(e) =>
                setMovementAmount(parseFloat(e.target.value) || 0)
              }
            />
          </div>
          <div>
            <label className="label">{t("field.reason")}</label>
            <input
              className="input"
              value={movementReason}
              onChange={(e) => setMovementReason(e.target.value)}
            />
          </div>
          {movementError && (
            <p className="text-sm text-red-600">{movementError}</p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setMovementModal(false)}
              className="btn-secondary flex-1"
            >
              {t("action.cancel")}
            </button>
            <button
              type="button"
              onClick={handleAddMovement}
              disabled={
                movementSubmitting ||
                movementAmount <= 0 ||
                !movementReason.trim()
              }
              className="btn-primary flex-1"
            >
              {movementSubmitting ? t("action.saving") : t("action.add")}
            </button>
          </div>
        </div>
      </Modal>

      {/* Close Day Modal */}
      <Modal
        open={closeModal}
        onClose={() => setCloseModal(false)}
        title={t("cashDrawer.closeDayTitle")}
        size="sm"
      >
        <div className="space-y-4">
          {session && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between text-gray-600">
                <span>{t("cashDrawer.expectedCash")}</span>
                <span className="font-semibold">
                  ${fmtCurrency(session.visitSummary.expectedCash)}
                </span>
              </div>
            </div>
          )}
          <div>
            <label className="label">{t("cashDrawer.closingCash")}</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input"
              value={closingCash}
              onChange={(e) => setClosingCash(parseFloat(e.target.value) || 0)}
            />
          </div>
          {session && (
            <div
              className={`rounded-lg p-3 text-sm font-semibold flex justify-between ${
                difference !== null && difference >= 0
                  ? "bg-green-50 text-green-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              <span>{t("cashDrawer.difference")}</span>
              <span>
                {difference !== null
                  ? `${difference >= 0 ? "+" : ""}$${fmtCurrency(difference)}`
                  : "—"}
                {difference !== null &&
                  ` (${
                    difference >= 0
                      ? t("cashDrawer.over")
                      : t("cashDrawer.short")
                  })`}
              </span>
            </div>
          )}
          <div>
            <label className="label">
              {t("field.notes")}{" "}
              <span className="text-gray-400 font-normal">
                ({t("field.optional")})
              </span>
            </label>
            <input
              className="input"
              value={closeNotes}
              onChange={(e) => setCloseNotes(e.target.value)}
            />
          </div>
          {closeError && (
            <p className="text-sm text-red-600">{closeError}</p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setCloseModal(false)}
              className="btn-secondary flex-1"
            >
              {t("action.cancel")}
            </button>
            <button
              type="button"
              onClick={handleCloseDrawer}
              disabled={closeSubmitting}
              className="btn-primary flex-1"
            >
              {closeSubmitting
                ? t("action.saving")
                : t("cashDrawer.confirmClose")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
