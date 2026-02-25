"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "@/lib/i18n";

interface EditPinModalProps {
  open: boolean;
  onSuccess: () => void;
  onClose: () => void;
}

export function EditPinModal({ open, onSuccess, onClose }: EditPinModalProps) {
  const { t } = useTranslation();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Reset state whenever the modal opens
  useEffect(() => {
    if (open) { setPin(""); setError(""); }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/settings/edit-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (data.valid) {
        onSuccess();
      } else if (data.notSet) {
        setError(t("editPin.notSet"));
      } else {
        setError(t("editPin.incorrect"));
      }
    } catch {
      setError(t("editPin.incorrect"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
        <div className="text-2xl mb-3 text-center">🔒</div>
        <h2 className="text-base font-semibold text-gray-900 mb-1 text-center">
          {t("editPin.title")}
        </h2>
        <p className="text-sm text-gray-500 mb-5 text-center">{t("editPin.hint")}</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            autoFocus
            className="input w-full text-center tracking-widest text-lg"
            placeholder="••••"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            required
          />
          {error && (
            <p className="text-sm text-red-600 text-center">{error}</p>
          )}
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={loading || !pin} className="btn-primary flex-1">
              {loading ? "…" : t("editPin.verify")}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              {t("action.cancel")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
