// SheetJS adapter: workbook bytes -> SheetData[]. Runs in the browser and in Node tests.
import * as XLSX from "xlsx";
import type { SheetData } from "./parse";

export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_ROWS = 5000;

export function readWorkbook(data: ArrayBuffer | Uint8Array): SheetData[] {
  const wb = XLSX.read(data, { type: "array", cellDates: false, cellFormula: false, cellHTML: false, sheetRows: MAX_ROWS + 20 });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const ref = ws["!ref"];
    if (!ref) return { name, rows: [], firstRow: 1 };
    const range = XLSX.utils.decode_range(ref);
    // Always start at A1 so column positions and row numbers match the sheet.
    range.s.r = 0;
    range.s.c = 0;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true, range });
    return { name, rows, firstRow: 1 };
  });
}
