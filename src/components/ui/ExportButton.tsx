"use client";

import { useState } from "react";
import { useTranslation } from "@/lib/i18n";
import { Icon } from "./Icon";

export interface ExportSheet {
  name: string;
  rows: Record<string, unknown>[];
}

/**
 * Downloads the screen you are looking at as a workbook, one sheet per table,
 * for the accountant. The rows are built lazily so nothing is computed until
 * the button is pressed, and the xlsx library is imported on demand.
 */
export function ExportButton({
  filename,
  build,
  label,
  disabled,
}: {
  filename: string;
  build: () => ExportSheet[];
  label?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const sheets = build().filter((s) => s.rows.length > 0);
      if (sheets.length === 0) return;
      const { downloadExcel } = await import("@/lib/excel");
      // Excel refuses sheet names over 31 characters or containing []:*?/\
      downloadExcel(
        filename,
        sheets.map((s) => ({ ...s, name: s.name.replace(/[[\]:*?/\\]/g, " ").slice(0, 31) }))
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <button onClick={run} disabled={busy || disabled} className="btn-secondary text-sm">
      <Icon name="chart-bar" />
      {busy ? t("action.saving") : label ?? t("reports.exportExcel")}
    </button>
  );
}
