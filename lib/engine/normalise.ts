// Value coercion helpers shared by the parser and the rule-based chat parser.
import type { Floor, Lang, Priority, SpaceKind, Tier } from "./types";

export function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).replace(/ /g, " ").trim();
}

/** "APP-007", "app 7", "APP7", "App-0007" -> "APP-7". Display keeps the original. */
export function normaliseId(raw: string): string {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = s.match(/^([A-Z]*)0*(\d+)$/);
  if (m) return `${m[1] || "ID"}-${parseInt(m[2], 10)}`;
  return s;
}

export function normaliseHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/₹/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normaliseName(n: string): string {
  return n.toLowerCase().replace(/[^a-zऀ-෿ ]/g, " ").replace(/\s+/g, " ").trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

export interface NumResult {
  value: number | null;
  flag?: string; // plain-language note about a coercion
  kind?: "range" | "converted" | "unparseable" | "negative" | "word";
}

const WORD_NUMS: Record<string, number> = {
  zero: 0, none: 0, nil: 0, no: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50,
};

function firstNumbers(s: string): number[] {
  const out: number[] = [];
  const re = /\d[\d,]*(?:\.\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push(parseFloat(m[0].replace(/,/g, "")));
  return out;
}

/** Plain number such as years, sq ft or months. */
export function parsePlainNumber(raw: unknown): NumResult {
  if (typeof raw === "number") return Number.isFinite(raw) ? (raw < 0 ? { value: raw, kind: "negative", flag: `negative value ${raw}` } : { value: raw }) : { value: null, kind: "unparseable" };
  const s = cellText(raw).toLowerCase();
  if (!s || s === "-" || s === "na" || s === "n/a") return { value: null };
  if (/^-\s*\d/.test(s)) {
    const n = firstNumbers(s)[0];
    return { value: -n, kind: "negative", flag: `negative value -${n}` };
  }
  const nums = firstNumbers(s);
  if (nums.length >= 2 && /\d\s*(-|–|to)\s*\d/.test(s)) {
    return { value: Math.min(nums[0], nums[1]), kind: "range", flag: `range "${cellText(raw)}" read as the lower value ${Math.min(nums[0], nums[1])}` };
  }
  if (nums.length >= 1) return { value: nums[0] };
  const w = s.split(/\s+/).find((t) => t in WORD_NUMS);
  if (w !== undefined) return { value: WORD_NUMS[w], kind: "word" };
  return { value: null, kind: "unparseable", flag: `could not read "${cellText(raw)}" as a number` };
}

/** Money in ₹ lakh. Handles "25", "25 lakh", "₹25L", "₹25,00,000", "1.2 crore", "20-25 lakh". */
export function parseLakh(raw: unknown): NumResult {
  if (typeof raw === "number") return Number.isFinite(raw) ? (raw < 0 ? { value: raw, kind: "negative", flag: `negative amount ${raw}` } : { value: raw }) : { value: null, kind: "unparseable" };
  const original = cellText(raw);
  const s = original.toLowerCase().replace(/rs\.?|inr/g, "₹");
  if (!s || s === "-") return { value: null };
  if (/^-\s*[₹\d]/.test(s)) return { value: null, kind: "negative", flag: `negative amount "${original}"` };
  const nums = firstNumbers(s);
  if (!nums.length) return { value: null, kind: "unparseable", flag: `could not read "${original}" as an amount` };
  const isCrore = /crore|cr\b/.test(s);
  const isLakh = /lakh|lac|\bl\b|\dl\b/.test(s);
  const hasIndianCommas = /\d{1,2},\d{2},\d{3}/.test(s) || /\d,\d{3}/.test(s);
  const range = nums.length >= 2 && /\d\s*(-|–|to)\s*\d/.test(s);
  let v = range ? Math.min(nums[0], nums[1]) : nums[0];
  let flag: string | undefined;
  let kind: NumResult["kind"];
  if (isCrore) {
    v = v * 100;
    kind = "converted";
    flag = `"${original}" converted to ${round1(v)} lakh`;
  } else if (!isLakh && s.includes("₹") && hasIndianCommas && v >= 100000) {
    v = v / 100000;
    kind = "converted";
    flag = `"${original}" converted from rupees to ${round1(v)} lakh`;
  }
  if (range) {
    kind = "range";
    flag = `range "${original}" read as the lower value ${round1(v)} lakh`;
  }
  return { value: v, flag, kind };
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export interface PinResult {
  pin: string | null;
  problem?: "missing" | "invalid";
}

export function parsePin(raw: unknown): PinResult {
  if (raw === null || raw === undefined || cellText(raw) === "") return { pin: null, problem: "missing" };
  let s: string;
  if (typeof raw === "number") s = Number.isInteger(raw) ? String(raw) : String(Math.round(raw));
  else s = cellText(raw).replace(/\.0+$/, "").replace(/[\s-]/g, "");
  if (/^[1-9]\d{5}$/.test(s)) return { pin: s };
  return { pin: null, problem: "invalid" };
}

export function parsePinList(raw: unknown): { pins: string[]; bad: string[] } {
  const s = cellText(raw);
  const pins: string[] = [];
  const bad: string[] = [];
  for (const part of s.split(/[,;/\n]+/)) {
    const t = part.trim();
    if (!t) continue;
    const p = parsePin(t);
    if (p.pin) {
      if (!pins.includes(p.pin)) pins.push(p.pin);
    } else bad.push(t);
  }
  return { pins, bad };
}

function closest<T extends string>(s: string, options: Record<string, T>): T | null {
  const t = s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (t in options) return options[t];
  for (const [k, v] of Object.entries(options)) if (t.startsWith(k) || t.includes(k)) return v;
  let best: T | null = null;
  let bestD = 3;
  for (const [k, v] of Object.entries(options)) {
    const d = levenshtein(t, k);
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  return best;
}

export function parseSpace(raw: unknown): SpaceKind | null {
  return closest<SpaceKind>(cellText(raw), {
    "not yet identified": "None",
    "not yet": "None",
    "not identified": "None",
    "none": "None",
    "no space": "None",
    "looking": "None",
    "owned": "Owned",
    "own": "Owned",
    "self owned": "Owned",
    "rented": "Rented",
    "rent": "Rented",
    "leased": "Rented",
    "lease": "Rented",
  });
}

export function parseFloor(raw: unknown): Floor | null {
  const s = cellText(raw);
  if (!s) return null;
  return closest<Floor>(s, {
    "not known": "Unknown",
    "unknown": "Unknown",
    "not sure": "Unknown",
    "ground": "Ground",
    "gf": "Ground",
    "mall unit": "Mall",
    "mall": "Mall",
    "upper": "Upper",
    "first": "Upper",
    "1st": "Upper",
    "second": "Upper",
    "basement": "Upper",
  });
}

export function parseLanguage(raw: unknown): Lang | null {
  return closest<Lang>(cellText(raw), { kannada: "Kannada", english: "English", hindi: "Hindi", eng: "English" });
}

export function parsePriority(raw: unknown): Priority | null {
  return closest<Priority>(cellText(raw), { high: "High", medium: "Medium", med: "Medium", low: "Low" });
}

export function parseTier(raw: unknown): Tier | null {
  const s = cellText(raw);
  const m = s.match(/[123]/);
  if (m) return Number(m[0]) as Tier;
  return null;
}

export function parseTarget(raw: unknown): NumResult {
  const s = cellText(raw).toLowerCase();
  if (/asap|immediate|urgent|right away|soon as/.test(s)) return { value: 1, kind: "word", flag: `"${cellText(raw)}" read as 1 month` };
  if (/flexible|any ?time|no rush|open/.test(s)) return { value: null, kind: "word", flag: `"${cellText(raw)}" read as no fixed target` };
  return parsePlainNumber(raw);
}

/** Size in sq ft with unit detection (sq m, sq yd / gaj). */
export function parseSize(raw: unknown): NumResult {
  const s = cellText(raw).toLowerCase();
  const base = parsePlainNumber(raw);
  if (base.value === null) return base;
  if (/sq\.?\s*m|sqm|square met|m2|m²/.test(s)) {
    const v = Math.round(base.value * 10.764);
    return { value: v, kind: "converted", flag: `"${cellText(raw)}" converted from square metres to ${v} sq ft` };
  }
  if (/yard|yd|gaj/.test(s)) {
    const v = Math.round(base.value * 9);
    return { value: v, kind: "converted", flag: `"${cellText(raw)}" converted from square yards to ${v} sq ft` };
  }
  return base;
}

/** Stable 32-bit FNV-1a hash rendered as base36. */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36).padStart(7, "0");
}
