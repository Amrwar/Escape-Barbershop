"use client";

import { useTranslation } from "@/lib/i18n";
import { VISIT_PAYMENT_METHODS, paymentMethodKey, type VisitPaymentMethod } from "@/lib/payments";

export interface PaymentAmounts {
  cashAmount: number;
  cardAmount: number;
  instapayAmount: number;
}

export const NO_PAYMENT_AMOUNTS: PaymentAmounts = { cashAmount: 0, cardAmount: 0, instapayAmount: 0 };

const PARTS = [
  { key: "cashAmount", label: "newVisit.cashAmount" },
  { key: "cardAmount", label: "newVisit.cardAmount" },
  { key: "instapayAmount", label: "newVisit.instapayAmount" },
] as const;

/**
 * How the customer paid: one method, or a mix of cash, card and InstaPay. Sits
 * inside the visit form's two-column grid. A mixed payment shows what is left
 * to split, and each part can take the rest in one tap.
 */
export function PaymentFields({
  method,
  onMethodChange,
  amounts,
  onAmountsChange,
  total,
}: {
  method: VisitPaymentMethod;
  onMethodChange: (method: VisitPaymentMethod) => void;
  amounts: PaymentAmounts;
  onAmountsChange: (amounts: PaymentAmounts) => void;
  total: number;
}) {
  const { t, fmtCurrency } = useTranslation();
  const toPiastres = (n: number) => Math.round(n * 100);
  const remaining =
    (toPiastres(total) - toPiastres(amounts.cashAmount) - toPiastres(amounts.cardAmount) - toPiastres(amounts.instapayAmount)) / 100;
  const addsUp = Math.abs(remaining) <= 0.01;

  return (
    <>
      <div>
        <label className="label">{t("field.paymentMethod")}</label>
        <select
          className="input"
          value={method}
          onChange={(e) => {
            const next = e.target.value as VisitPaymentMethod;
            onMethodChange(next);
            if (next !== "MIXED") onAmountsChange(NO_PAYMENT_AMOUNTS);
          }}
        >
          {VISIT_PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {t(paymentMethodKey(m))}
            </option>
          ))}
        </select>
      </div>

      {method === "MIXED" && (
        <>
          {PARTS.map((part) => (
            <div key={part.key}>
              <div className="flex items-baseline justify-between gap-2">
                <label className="label">{t(part.label)}</label>
                {remaining > 0.01 && (
                  <button
                    type="button"
                    className="text-xs font-medium text-primary-600 hover:underline"
                    onClick={() =>
                      onAmountsChange({ ...amounts, [part.key]: (toPiastres(amounts[part.key]) + toPiastres(remaining)) / 100 })
                    }
                  >
                    + {fmtCurrency(remaining)}
                  </button>
                )}
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input"
                value={amounts[part.key]}
                onChange={(e) => onAmountsChange({ ...amounts, [part.key]: parseFloat(e.target.value) || 0 })}
              />
            </div>
          ))}
          <div className="flex items-end">
            <p className={`text-xs pb-2 ${addsUp ? "text-green-600" : "text-amber-600"}`}>
              {addsUp
                ? `✓ ${t("newVisit.splitMatches")}`
                : `${t("newVisit.splitMustEqualTotal")} · ${t("newVisit.splitRemaining")}: ${fmtCurrency(remaining)}`}
            </p>
          </div>
        </>
      )}
    </>
  );
}
