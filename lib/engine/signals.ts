// Rule-based reading of free text (notes, business). Free text is data, never instructions.
import { normaliseName, levenshtein } from "./normalise";
import type { Application } from "./types";

export interface NoteSignals {
  loan?: string;
  injection?: string;
  foundShop?: string;
  weakTitle?: string;
  conflict?: string;
  provenOperator?: string;
  compliance?: string;
  dispute?: string;
  investClaim?: { lakh: number; quote: string };
  floorClaim?: { floor: "Ground" | "Upper" | "Mall"; quote: string };
  festival?: { name: string; quote: string };
  unreadable?: boolean;
}

/** Return the sentence of `text` containing the match, trimmed for evidence. */
export function quoteAround(text: string, idx: number): string {
  const start = Math.max(text.lastIndexOf(".", idx - 1) + 1, 0);
  let end = text.indexOf(".", idx);
  if (end < 0) end = text.length;
  const q = text.slice(start, end).trim();
  return q.length > 120 ? q.slice(0, 117) + "..." : q;
}

function find(text: string, re: RegExp): string | undefined {
  const m = re.exec(text);
  return m ? quoteAround(text, m.index) : undefined;
}

const LOAN = /\b(bank )?loan|\bemi\b|sanction|mudra|financ(e|ing) from|borrow|लोन|ऋण|कर्ज|ಸಾಲ|ಲೋನ್/i;
const INJECTION = /ignore (all |any |the |previous |prior )?(rules|instructions|policy|above)|approve me|disregard|system prompt|you are (an? )?(ai|assistant|model)|override|jailbreak|score me|mark (me|this) (as )?approved|मुझे (अप्रूव|मंजूर)|\bsystem\s*:|set (my |the )?score|give (me )?(100|full marks|top score)|\bapprove (this|it|my|me)\b|मंजूर कर|अप्रूव कर|नियम (भूल|अनदेखा|तोड़)|ಅನುಮೋದಿಸಿ|ನಿಯಮ.{0,10}(ಮರೆ|ನಿರ್ಲಕ್ಷ)/i;
const FOUND_SHOP = /(found|have|got|secured|identified|already (have|own|rent))( a| the| my)? (shop|space|site|unit|premises|place)|i have a shop|दुकान (मिल|है)|जगह मिल|ಅಂಗಡಿ (ಸಿಕ್ಕಿದೆ|ಇದೆ)|ಜಾಗ ಸಿಕ್ಕಿದೆ/i;
const WEAK_OWNED = /family|joint|ancestral|father'?s|mother'?s|in-?laws?|brother'?s|disputed|papers? (pending|not ready)|not in my name|partition|पारिवारिक|पिता|ಕುಟುಂಬ|ತಂದೆ/i;
const WEAK_RENTED = /verbal|no (written |rent )?agreement|oral|short lease|11[- ]month|month[- ]to[- ]month|informal|without agreement|lease (ends|expires)/i;
const CONFLICT = /(run|own|operate|have)s? (a |an )?\w+ franchise|franchisee of|dealer(ship)? for|distributor for|exclusive|competitor|rival brand|another brand/i;
const PROVEN = /existing (partner|franchisee)|already (run|operate|own) (one of )?your|our (current|existing) store|your franchise(e)? since/i;
const COMPLIANCE = /\bcash\b|unaccounted|black money|friend'?s money|third[- ]party|relative will (fund|pay)|investor will pay|undisclosed|नकद|ನಗದು/i;
const DISPUTE = /court|case pending|litigation|legal (dispute|case|notice)|dispute|मुकदमा|ವಿವಾದ/i;
const FESTIVAL = /(diwali|deepavali|dasara|dussehra|ugadi|navratri|christmas|eid|pongal|sankranti)/i;
const NON_LATIN = /[ऀ-ॿಀ-೿]/;

export function readNotes(app: Pick<Application, "notes" | "business" | "space" | "invest">): NoteSignals {
  const t = app.notes || "";
  const s: NoteSignals = {};
  const bizConflict = CONFLICT.test(app.business) ? `business: ${app.business}` : undefined;
  if (!t) {
    if (bizConflict) s.conflict = bizConflict;
    return s;
  }
  s.loan = find(t, LOAN);
  s.injection = find(t, INJECTION);
  s.foundShop = find(t, FOUND_SHOP);
  if (app.space === "Owned") s.weakTitle = find(t, WEAK_OWNED);
  if (app.space === "Rented") s.weakTitle = find(t, WEAK_RENTED);
  s.conflict = find(t, CONFLICT) ?? bizConflict;
  s.provenOperator = find(t, PROVEN);
  s.compliance = find(t, COMPLIANCE);
  s.dispute = find(t, DISPUTE);
  const inv = /(?:put in|invest|arrange|have|budget of|capital of|upto|up to)\D{0,12}(?:₹|rs\.?\s*)?(\d+(?:\.\d+)?)\s*(lakh|lac|l\b|crore|cr\b)/i.exec(t);
  if (inv) {
    const v = parseFloat(inv[1]) * (/cr/i.test(inv[2]) ? 100 : 1);
    if (app.invest !== null && Math.abs(v - app.invest) >= 1) s.investClaim = { lakh: v, quote: quoteAround(t, inv.index) };
  }
  const fl = /(ground floor|first floor|second floor|upper floor|upstairs|1st floor|in a mall|mall unit|ग्राउंड फ्लोर|ನೆಲ ಮಹಡಿ)/i.exec(t);
  if (fl) {
    const w = fl[1].toLowerCase();
    const floor = /ground|ग्राउंड|ನೆಲ/.test(w) ? "Ground" : /mall/.test(w) ? "Mall" : "Upper";
    s.floorClaim = { floor, quote: quoteAround(t, fl.index) };
  }
  const fe = FESTIVAL.exec(t);
  if (fe) s.festival = { name: fe[1], quote: quoteAround(t, fe.index) };
  const anyHit = Object.values(s).some(Boolean);
  if (!anyHit && NON_LATIN.test(t)) s.unreadable = true;
  return s;
}

/** Business text claims years of running a shop, e.g. "ran a shop for 6 years". */
export function businessYears(business: string): number | null {
  const m = /(\d+)\s*(\+\s*)?(years?|yrs?|साल|ವರ್ಷ)/i.exec(business);
  if (!m) return null;
  if (!/(run|ran|own|manag|shop|store|retail|business|outlet|kirana|dukaan|दुकान|ಅಂಗಡಿ)/i.test(business)) return null;
  return Number(m[1]);
}

export function businessRelevance(business: string): "strong" | "partial" | "none" {
  const b = business.toLowerCase();
  if (/(run|runs|ran|owner|own|manag|store|shop|retail|showroom|outlet|supermarket|franchise|dealer|boutique|pharmacy|kirana|trading|mart|electronics|footwear|garment|hardware)/.test(b)) return "strong";
  if (/(sales|business|tailor|service|agency|distribut|wholesale|trader|vendor|merchant)/.test(b)) return "partial";
  return "none";
}

/** Near-duplicate names: "Ravi Kumar" vs "Ravi Kumar K", small typos, reordered tokens. */
export function similarNames(a: string, b: string): boolean {
  const x = normaliseName(a);
  const y = normaliseName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const tx = x.split(" ").filter((t) => t.length > 1);
  const ty = y.split(" ").filter((t) => t.length > 1);
  const sx = new Set(tx);
  const sy = new Set(ty);
  const shared = [...sx].filter((t) => sy.has(t)).length;
  if (shared >= 2 && (shared === sx.size || shared === sy.size)) return true;
  if (tx.sort().join(" ") === ty.sort().join(" ")) return true;
  return Math.min(x.length, y.length) >= 6 && levenshtein(x, y) <= 2;
}

export const sameNotes = (a: string, b: string) => {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9ऀ-෿]/g, "");
  return n(a).length >= 20 && n(a) === n(b);
};
