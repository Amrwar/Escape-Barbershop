"use client";

import { Icon, type IconName } from "@/components/ui/Icon";
import { useTranslation } from "@/lib/i18n";
import { OUTFLOW_METHODS, paymentMethodKey, type OutflowMethod } from "@/lib/payments";

// Which account an expense or advance leaves: the colours match the money
// palette everywhere else (green cash, blue card, purple InstaPay).
const LOOK: Record<OutflowMethod, { icon: IconName; badge: string }> = {
  CASH: { icon: "banknote", badge: "bg-green-50 text-green-700" },
  CARD: { icon: "card", badge: "bg-blue-50 text-blue-700" },
  INSTAPAY: { icon: "phone", badge: "bg-purple-50 text-purple-700" },
};

const lookOf = (method: string) => LOOK[method as OutflowMethod] ?? LOOK.CASH;

/** The row of buttons for choosing how an expense or advance was paid. */
export function PayMethodPicker({ value, onChange }: { value: OutflowMethod; onChange: (m: OutflowMethod) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2">
      {OUTFLOW_METHODS.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`flex-1 sm:flex-none sm:min-w-32 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
            value === m ? "bg-primary-50 border-primary-300 text-primary-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          <Icon name={lookOf(m).icon} />
          {t(paymentMethodKey(m))}
        </button>
      ))}
    </div>
  );
}

export function PayMethodBadge({ method }: { method: string }) {
  const { t } = useTranslation();
  const look = lookOf(method);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${look.badge}`}>
      <Icon name={look.icon} className="w-3.5 h-3.5" />
      {t(paymentMethodKey(method))}
    </span>
  );
}
