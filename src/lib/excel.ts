import * as XLSX from "xlsx";

export function downloadExcel(
  filename: string,
  sheets: { name: string; rows: Record<string, unknown>[] }[]
) {
  const wb = XLSX.utils.book_new();
  sheets.forEach(({ name, rows }) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  });
  XLSX.writeFile(wb, filename);
}

export interface BarberStatsExportData {
  barberName: string;
  period: string;
  summary: {
    visitCount: number;
    totalRevenue: number;
    cashTotal: number;
    cardTotal: number;
    mixedTotal: number;
    discountsTotal: number;
    topServices: { name: string; count: number; revenue: number }[];
  };
  visits: {
    visitAt: string;
    customerName: string;
    services: string;
    paymentMethod: string;
    cashAmount: number | null;
    cardAmount: number | null;
    subtotal: number;
    discountPercent: number;
    total: number;
  }[];
  penalties: { date: string; amount: number; reason: string }[];
  absentDays: string[];
}

function setColWidths(ws: XLSX.WorkSheet, widths: number[]) {
  ws["!cols"] = widths.map((wch) => ({ wch }));
}

function addCell(ws: XLSX.WorkSheet, addr: string, value: unknown, numFmt?: string) {
  const cell: XLSX.CellObject = { v: value as XLSX.CellObject["v"], t: typeof value === "number" ? "n" : "s" };
  if (numFmt) cell.z = numFmt;
  ws[addr] = cell;
}

export function downloadBarberExcel(filename: string, data: BarberStatsExportData) {
  const wb = XLSX.utils.book_new();
  const $ = (n: number) => `$${n.toFixed(2)}`;

  // ── Sheet 1: Summary ─────────────────────────────────────────────────────
  const summaryData: (string | number)[][] = [
    ["Barber Report", ""],
    ["Barber", data.barberName],
    ["Period", data.period],
    ["", ""],
    ["PERFORMANCE SUMMARY", ""],
    ["Metric", "Value"],
    ["Total Visits", data.summary.visitCount],
    ["Total Revenue", $(data.summary.totalRevenue)],
    ["Cash Revenue", $(data.summary.cashTotal)],
    ["Card Revenue", $(data.summary.cardTotal)],
    ["Mixed Revenue", $(data.summary.mixedTotal)],
    ["Discounts Given", $(data.summary.discountsTotal)],
    ["", ""],
    ["TOP SERVICES", ""],
    ["Service", "Times Done", "Revenue"],
    ...data.summary.topServices.map((s) => [s.name, s.count, $(s.revenue)]),
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  setColWidths(wsSummary, [30, 20, 15]);
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  // ── Sheet 2: Visits ───────────────────────────────────────────────────────
  const visitRows = data.visits.map((v) => ({
    "Date & Time": new Date(v.visitAt).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
    }),
    "Customer": v.customerName,
    "Services": v.services,
    "Payment": v.paymentMethod,
    "Cash ($)": v.cashAmount ?? 0,
    "Card ($)": v.cardAmount ?? 0,
    "Subtotal ($)": v.subtotal,
    "Discount %": v.discountPercent,
    "Total ($)": v.total,
  }));

  const wsVisits = XLSX.utils.json_to_sheet(visitRows);
  setColWidths(wsVisits, [22, 22, 40, 10, 10, 10, 12, 10, 10]);
  XLSX.utils.book_append_sheet(wb, wsVisits, "Visits");

  // ── Sheet 3: Services Breakdown ───────────────────────────────────────────
  const serviceRows = data.summary.topServices.map((s, i) => ({
    "#": i + 1,
    "Service": s.name,
    "Times Done": s.count,
    "Revenue ($)": s.revenue,
  }));

  const wsServices = XLSX.utils.json_to_sheet(serviceRows.length ? serviceRows : [{ "#": "", Service: "No data", "Times Done": "", "Revenue ($)": "" }]);
  setColWidths(wsServices, [5, 30, 12, 14]);
  XLSX.utils.book_append_sheet(wb, wsServices, "Services");

  // ── Sheet 4: Penalties ────────────────────────────────────────────────────
  const penaltyRows = data.penalties.length
    ? data.penalties.map((p) => ({
        "Date": new Date(p.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
        "Amount ($)": p.amount,
        "Reason": p.reason,
      }))
    : [{ Date: "No penalties in this period", "Amount ($)": "", Reason: "" }];

  const wsPenalties = XLSX.utils.json_to_sheet(penaltyRows);
  setColWidths(wsPenalties, [18, 12, 40]);
  XLSX.utils.book_append_sheet(wb, wsPenalties, "Penalties");

  // ── Sheet 5: Attendance (absent days) ────────────────────────────────────
  const attendanceRows = data.absentDays.length
    ? data.absentDays.map((d, i) => ({
        "#": i + 1,
        "Absent Date": new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }),
      }))
    : [{ "#": "", "Absent Date": "No absent days in this period" }];

  const wsAttendance = XLSX.utils.json_to_sheet(attendanceRows);
  setColWidths(wsAttendance, [5, 28]);
  XLSX.utils.book_append_sheet(wb, wsAttendance, "Attendance");

  XLSX.writeFile(wb, filename);
}
