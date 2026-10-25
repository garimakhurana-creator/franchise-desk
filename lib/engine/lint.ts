// Explanation style rules (SPEC 7), applied to every user-visible explanation.
import { REASON_CODES } from "./codes";
import glossary from "./glossary.json";
import type { Decision } from "./types";

export interface LintIssue {
  id: string;
  rule: string;
  text: string;
}

const FIELD_NAMES = /\b(investRaw|pinRaw|targetMonths|fieldFlags|allocatedPin|territoryKey|provenance|undefined|null|NaN|\[object Object\])\b/;
const JARGON = /\b(boolean|enum|payload|schema|regex|stack trace|exception|json)\b/i;
const ACCUSE = /\b(fraud|fraudulent|collu\w*|cheat\w*|fake|liar|lying|scam\w*|suspicious|dishonest)\b/i;
const HAS_FACT = /\d|[A-Z]{2,}-\d+/;
const CODE_RE = new RegExp(String.raw`\b(${REASON_CODES.join("|")})\b`);

export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Rough grade level (Flesch-Kincaid) on plain words only; numbers and IDs are ignored. */
export function gradeLevel(s: string): number {
  // Proper nouns (place names) are not a reading difficulty; skip capitalised words after the first.
  const words = s
    .replace(/[A-Z]{2,}-\d+|₹?\d[\d,.]*/g, "")
    .split(/\s+/)
    .filter((w, i) => /[a-z]/i.test(w) && !(i > 0 && /^[("']?[A-Z][a-z]/.test(w)));
  if (!words.length) return 0;
  const sentences = Math.max(1, (s.match(/[.;!?](\s|$)/g) ?? []).length);
  const syll = words.reduce((n, w) => n + Math.max(1, (w.toLowerCase().replace(/e$/, "").match(/[aeiouy]+/g) ?? []).length), 0);
  return 0.39 * (words.length / sentences) + 11.8 * (syll / words.length) - 15.59;
}

export function lintDecision(d: Decision): LintIssue[] {
  const out: LintIssue[] = [];
  const add = (rule: string, text: string) => out.push({ id: d.id, rule, text });
  const visible = [d.why, d.nextStep, ...d.detail, ...d.asks.map((a) => a.what), ...(d.flags.map((f) => f.text))];
  if (!HAS_FACT.test(d.why)) add("why needs a number or ID", d.why);
  if (wordCount(d.why) > 28) add(`why over 28 words (${wordCount(d.why)})`, d.why);
  if (gradeLevel(d.why) > 12) add(`why reading level ${gradeLevel(d.why).toFixed(1)}`, d.why);
  if (!d.nextStep) add("missing next step", d.why);
  if (!d.owner) add("missing owner", d.why);
  for (const t of visible) {
    const code = CODE_RE.exec(t);
    if (code) add(`raw code ${code[1]}`, t);
    if (FIELD_NAMES.test(t)) add("internal field name", t);
    if (JARGON.test(t)) add("jargon", t);
    if (ACCUSE.test(t)) add("accusatory wording", t);
    for (const b of glossary.banned) if (t.toLowerCase().includes(b)) add(`banned phrase "${b}"`, t);
    if (/as per policy/i.test(t) && !/\d/.test(t)) add('"as per policy" without a number', t);
  }
  if (d.codes.includes("CITY_PIN_MISMATCH") && d.status === "ON_HOLD" && !/says .+ but .+ is /i.test(d.why) && !/pin \d+ is .+ but territory/i.test(d.why) && d.codes[0] === "CITY_PIN_MISMATCH") add("contradiction must name both facts", d.why);
  if (d.status === "ON_HOLD" && d.codes[0] === "SPACE_CONTRADICTION" && !/(yet|but)/.test(d.why)) add("contradiction must name both facts", d.why);
  return out;
}

export function lintAll(ds: Decision[]): LintIssue[] {
  return ds.flatMap(lintDecision);
}
