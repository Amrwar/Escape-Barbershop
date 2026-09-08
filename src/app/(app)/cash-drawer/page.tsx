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
    expensesTotal: number;
    cashExpenses: number;
    cardExpenses: number;
    cashAdvances: number;
    cardAdvances: number;
    advancesTotal: number;
    cardSales: number;
    cardNet: number;
    visaPercent: number;
    visaCommission: number;
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
  _count: { visits: number };
}

interface DayGroup {
  date: string; // yyyy-MM-dd
  label: string;
  sessions: RecentSession[];
  totalVisits: number;
}

export default function CashDrawerPage() {
  const { data: authSession } = useSession();
  const isOwner = authSession?.user?.role === "OWNER";
  // Opening, closing and recording cash movements is floor work; deleting
  // movements or sessions stays with the owner.
  const canOperate = isOwner || authSession?.user?.role === "CASHIER";
  const { t, fmtCurrency, fmtDateTime, fmtTime } = useTranslation();

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
  const [closeTarget, setCloseTarget] = useState<"session" | "day">("session");
  const [closingCash, setClosingCash] = useState(0);
  const [closeNotes, setCloseNotes] = useState("");
  const [closeSubmitting, setCloseSubmitting] = useState(false);
  const [closeError, setCloseError] = useState("");

  // Delete session state
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);
  const [deletePin, setDeletePin] = useState("");
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Tip state
  const [tipModal, setTipModal] = useState(false);
  const [tipAmount, setTipAmount] = useState(0);
  const [tipSubmitting, setTipSubmitting] = useState(false);
  const [tipError, setTipError] = useState("");

  // Delete movement state
  const [deleteMovementModal, setDeleteMovementModal] = useState(false);
  const [deleteMovementId, setDeleteMovementId] = useState<string | null>(null);
  const [deleteMovementPin, setDeleteMovementPin] = useState("");
  const [deleteMovementSubmitting, setDeleteMovementSubmitting] = useState(false);
  const [deleteMovementError, setDeleteMovementError] = useState("");

  const fetchSession = useCallback(async () => {
    const res = await fetch("/api/cash-drawer");
    const data = await res.json();
    setSession(data);
  }, []);

  const fetchSessions = useCallback(async () => {
    const res = await fetch("/api/cash-drawer/sessions");
    const data = await res.json();
    setRecentSessions(Array.isArray(data) ? data : []);
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
        setCloseNotes("");
        // Auto-open a new session: carry closing cash for session handover, start at 0 for a new day
        const newOpeningCash = closeTarget === "session" ? closingCash : 0;
        setClosingCash(0);
        await fetch("/api/cash-drawer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ openingCash: newOpeningCash, notes: "" }),
        });
        await Promise.all([fetchSession(), fetchSessions()]);
      } else {
        const d = await res.json();
        setCloseError(d.error ?? "Failed");
      }
    } finally {
      setCloseSubmitting(false);
    }
  };

  const handleAddTip = async () => {
    setTipSubmitting(true);
    setTipError("");
    try {
      const res = await fetch("/api/cash-drawer/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "OUT", amount: tipAmount, reason: t("cashDrawer.tipsReason") }),
      });
      if (res.ok) {
        setTipModal(false);
        setTipAmount(0);
        await fetchSession();
      } else {
        const d = await res.json();
        setTipError(d.error ?? "Failed");
      }
    } finally {
      setTipSubmitting(false);
    }
  };

  const handleDeleteMovement = async () => {
    if (!deleteMovementId) return;
    setDeleteMovementSubmitting(true);
    setDeleteMovementError("");
    try {
      const verifyRes = await fetch("/api/settings/edit-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: deleteMovementPin }),
      });
      const { valid } = await verifyRes.json();
      if (!valid) { setDeleteMovementError(t("newVisit.wrongPin")); return; }

      await fetch(`/api/cash-drawer/movements/${deleteMovementId}`, { method: "DELETE" });
      setDeleteMovementModal(false);
      setDeleteMovementId(null);
      setDeleteMovementPin("");
      await fetchSession();
    } finally {
      setDeleteMovementSubmitting(false);
    }
  };

  const handleDeleteSession = async () => {
    if (!deleteSessionId) return;
    setDeleteSubmitting(true);
    setDeleteError("");
    try {
      const res = await fetch(`/api/cash-drawer/sessions/${deleteSessionId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: deletePin }),
      });
      if (res.ok) {
        setDeleteModal(false);
        setDeleteSessionId(null);
        setDeletePin("");
        await fetchSessions();
        await fetchSession();
      } else {
        const d = await res.json();
        setDeleteError(d.error ?? "Failed");
      }
    } finally {
      setDeleteSubmitting(false);
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

  // Group closed sessions by calendar day (exclude the currently open session)
  const recentDays: DayGroup[] = (() => {
    const map = new Map<string, DayGroup>();
    for (const s of recentSessions) {
      if (s.status === "OPEN") continue; // open session shown in main view
      const d = new Date(s.openedAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!map.has(key)) {
        map.set(key, {
          date: key,
          label: d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
          sessions: [],
          totalVisits: 0,
        });
      }
      const g = map.get(key)!;
      g.sessions.push(s);
      g.totalVisits += s._count.visits;
    }
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  })();

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
            {canOperate && (
              <button onClick={() => setOpenModal(true)} className="btn-primary">
                {t("cashDrawer.openDrawer")}
              </button>
            )}
          </div>
          {recentDays.length > 0 && <RecentDays days={recentDays} isOwner={isOwner} onDelete={(id) => { setDeleteSessionId(id); setDeletePin(""); setDeleteError(""); setDeleteModal(true); }} viewDayLabel={t("cashDrawer.viewDayReport")} viewReportLabel={t("cashDrawer.viewReport")} deleteLabel={t("action.delete")} />}
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
                    {fmtDateTime(session.openedAt)}
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
                <span>{fmtCurrency(session.openingCash)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>
                  {t("cashDrawer.cashSales")} ({session.visitSummary.visitCount}{" "}
                  visits)
                </span>
                <span className="text-green-700">
                  +{fmtCurrency(session.visitSummary.cashSales)}
                </span>
              </div>
              {session.visitSummary.cashIn > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>{t("cashDrawer.cashIn")}</span>
                  <span className="text-green-700">
                    +{fmtCurrency(session.visitSummary.cashIn)}
                  </span>
                </div>
              )}
              {session.visitSummary.cashOut > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>{t("cashDrawer.cashOut")}</span>
                  <span className="text-red-600">
                    -{fmtCurrency(session.visitSummary.cashOut)}
                  </span>
                </div>
              )}
              {session.visitSummary.cashAdvances > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>{t("cashDrawer.advances")}</span>
                  <span className="text-red-600">
                    -{fmtCurrency(session.visitSummary.cashAdvances)}
                  </span>
                </div>
              )}
              {session.visitSummary.cashExpenses > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>{t("expenses.title")}</span>
                  <span className="text-red-600">
                    -{fmtCurrency(session.visitSummary.cashExpenses)}
                  </span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base text-gray-900 pt-2 border-t border-green-200">
                <span>{t("cashDrawer.expectedCash")}</span>
                <span className="text-green-700">
                  {fmtCurrency(session.visitSummary.expectedCash)}
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
                          {fmtTime(m.createdAt)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-sm font-semibold ${
                          m.type === "IN" ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {m.type === "IN" ? "+" : "-"}{fmtCurrency(m.amount)}
                      </span>
                      {isOwner && (
                        <button
                          onClick={() => { setDeleteMovementId(m.id); setDeleteMovementPin(""); setDeleteMovementError(""); setDeleteMovementModal(true); }}
                          className="text-xs text-red-400 hover:text-red-600"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent days */}
          {recentDays.length > 0 && <RecentDays days={recentDays} isOwner={isOwner} onDelete={(id) => { setDeleteSessionId(id); setDeletePin(""); setDeleteError(""); setDeleteModal(true); }} viewDayLabel={t("cashDrawer.viewDayReport")} viewReportLabel={t("cashDrawer.viewReport")} deleteLabel={t("action.delete")} />}

          {/* Drawer actions */}
          {canOperate && (
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
              <button
                onClick={() => { setTipAmount(0); setTipError(""); setTipModal(true); }}
                className="btn-secondary text-sm text-yellow-700 border-yellow-300"
              >
                💰 {t("cashDrawer.addTips")}
              </button>
              <div className="flex-1" />
              <button
                onClick={() => {
                  setClosingCash(
                    parseFloat(session.visitSummary.expectedCash.toFixed(2))
                  );
                  setCloseTarget("session");
                  setCloseModal(true);
                }}
                className="btn-secondary"
              >
                {t("cashDrawer.closeSession")}
              </button>
              <button
                onClick={() => {
                  setClosingCash(
                    parseFloat(session.visitSummary.expectedCash.toFixed(2))
                  );
                  setCloseTarget("day");
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

      {/* Tips Modal */}
      <Modal open={tipModal} onClose={() => setTipModal(false)} title={t("cashDrawer.addTips")} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">{t("cashDrawer.tipsHint")}</p>
          <div>
            <label className="label">{t("field.amount")}</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              className="input"
              value={tipAmount}
              onChange={(e) => setTipAmount(parseFloat(e.target.value) || 0)}
              autoFocus
            />
          </div>
          {tipError && <p className="text-sm text-red-600">{tipError}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={() => setTipModal(false)} className="btn-secondary flex-1">{t("action.cancel")}</button>
            <button
              type="button"
              onClick={handleAddTip}
              disabled={tipSubmitting || tipAmount <= 0}
              className="btn-primary flex-1"
            >
              {tipSubmitting ? t("action.saving") : t("action.add")}
            </button>
          </div>
        </div>
      </Modal>

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

      {/* Delete Movement Modal */}
      <Modal
        open={deleteMovementModal}
        onClose={() => setDeleteMovementModal(false)}
        title={t("action.delete")}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{t("settings.securityPinVerify")}</p>
          <input
            type="password"
            className="input text-center tracking-widest text-lg"
            placeholder="••••"
            value={deleteMovementPin}
            onChange={(e) => setDeleteMovementPin(e.target.value)}
            autoFocus
          />
          {deleteMovementError && <p className="text-sm text-red-600 text-center">{deleteMovementError}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={() => setDeleteMovementModal(false)} className="btn-secondary flex-1">{t("action.cancel")}</button>
            <button
              type="button"
              onClick={handleDeleteMovement}
              disabled={deleteMovementSubmitting || !deleteMovementPin}
              className="flex-1 py-2 px-4 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleteMovementSubmitting ? t("action.saving") : t("action.delete")}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Session Modal */}
      <Modal
        open={deleteModal}
        onClose={() => setDeleteModal(false)}
        title={t("cashDrawer.deleteSession")}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{t("cashDrawer.deleteSessionHint")}</p>
          <div>
            <label className="label">{t("cashDrawer.enterPin")}</label>
            <input
              type="password"
              className="input text-center tracking-widest text-lg"
              placeholder="••••"
              value={deletePin}
              onChange={(e) => setDeletePin(e.target.value)}
              autoFocus
            />
          </div>
          {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setDeleteModal(false)}
              className="btn-secondary flex-1"
            >
              {t("action.cancel")}
            </button>
            <button
              type="button"
              onClick={handleDeleteSession}
              disabled={deleteSubmitting || !deletePin}
              className="flex-1 py-2 px-4 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleteSubmitting ? t("action.saving") : t("action.delete")}
            </button>
          </div>
        </div>
      </Modal>

      {/* Close Day Modal */}
      <Modal
        open={closeModal}
        onClose={() => setCloseModal(false)}
        title={closeTarget === "day" ? t("cashDrawer.closeDayTitle") : t("cashDrawer.closeSession")}
        size="sm"
      >
        <div className="space-y-4">
          {session && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between text-gray-600">
                <span>{t("cashDrawer.expectedCash")}</span>
                <span className="font-semibold">
                  {fmtCurrency(session.visitSummary.expectedCash)}
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
                  ? `${difference >= 0 ? "+" : ""}${fmtCurrency(difference)}`
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

function RecentDays({
  days,
  isOwner,
  onDelete,
  viewDayLabel,
  viewReportLabel,
  deleteLabel,
}: {
  days: DayGroup[];
  isOwner: boolean;
  onDelete: (id: string) => void;
  viewDayLabel: string;
  viewReportLabel: string;
  deleteLabel: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Recent Days</h2>
      </div>
      <div className="divide-y divide-gray-100">
        {days.map((day) => (
          <div key={day.date}>
            <div className="flex items-center justify-between px-5 py-3">
              <button
                className="flex items-center gap-3 text-start flex-1"
                onClick={() => setExpanded(expanded === day.date ? null : day.date)}
              >
                <span className="text-sm font-medium text-gray-900">{day.label}</span>
                <span className="text-xs text-gray-400" dir="ltr">{day.sessions.length} session{day.sessions.length !== 1 ? "s" : ""} · {day.totalVisits} visits</span>
                <span className="text-gray-400 text-xs">{expanded === day.date ? "▲" : "▼"}</span>
              </button>
              <Link
                href={`/cash-drawer/day-report?date=${day.date}`}
                className="btn-secondary text-xs shrink-0"
              >
                {viewDayLabel}
              </Link>
            </div>
            {expanded === day.date && (
              <div className="px-5 pb-3 space-y-2 bg-gray-50">
                {day.sessions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div>
                      <div className="text-xs font-medium text-gray-900">
                        {new Date(s.openedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {s.closedAt && ` — ${new Date(s.closedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                        <span className="text-gray-400 ms-2">by {s.openedBy.name}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {s._count.visits} visits
                        {s.closingCashCounted !== null && ` · Counted: ${s.closingCashCounted.toFixed(2)}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href={`/cash-drawer/report/${s.id}`} className="text-xs text-primary-600 hover:underline">
                        {viewReportLabel}
                      </Link>
                      {isOwner && (
                        <button onClick={() => onDelete(s.id)} className="text-xs text-red-400 hover:text-red-600">
                          {deleteLabel}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
