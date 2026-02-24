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
