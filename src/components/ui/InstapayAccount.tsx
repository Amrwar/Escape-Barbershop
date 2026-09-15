"use client";

import { useTranslation } from "@/lib/i18n";

/**
 * The InstaPay account: transfers in, less what was paid out of it. It sits
 * beside the cash and card accounts on the drawer and report screens, which
 * each supply their own heading.
 */
export function InstapayAccountLines({
  sales,
  expenses,
  advances = 0,
  net,
}: {
  sales: number;
  expenses: number;
  advances?: number;
  net: number;
}) {
  const { t, fmtCurrency } = useTranslation();
  return (
    <div className="space-y-2 text-sm max-w-sm">
      <div className="flex justify-between text-gray-600">
        <span>{t("cashDrawer.instapaySales")}</span>
        <span className="text-purple-700 tabular-nums">+{fmtCurrency(sales)}</span>
      </div>
      {expenses > 0 && (
        <div className="flex justify-between text-gray-600">
          <span>{t("cashDrawer.instapayExpenses")}</span>
          <span className="text-red-600 tabular-nums">-{fmtCurrency(expenses)}</span>
        </div>
      )}
      {advances > 0 && (
        <div className="flex justify-between text-gray-600">
          <span>{t("cashDrawer.advances")}</span>
          <span className="text-red-600 tabular-nums">-{fmtCurrency(advances)}</span>
        </div>
      )}
      <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-200">
        <span>{t("cashDrawer.instapayNet")}</span>
        <span className="text-purple-700 tabular-nums">{fmtCurrency(net)}</span>
      </div>
    </div>
  );
}
