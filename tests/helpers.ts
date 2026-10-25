import { readFileSync } from "node:fs";
import path from "node:path";
import { readWorkbook } from "@/lib/parse/xlsx";
import { parseWorkbook } from "@/lib/parse/parse";

export function loadXlsx(rel: string, source: "upload" | "sample" = "sample") {
  const buf = readFileSync(path.resolve(__dirname, rel));
  return parseWorkbook(readWorkbook(new Uint8Array(buf)), path.basename(rel), source);
}

export const TODAY = "2026-10-25";
