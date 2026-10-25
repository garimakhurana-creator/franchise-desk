// Rule-based follow-up parser: plain language -> Commands. Runs in the browser, no model needed.
import type { Dataset, Floor, SpaceKind, Status } from "../engine/types";
import { normaliseId } from "../engine/normalise";
import { cityRefs } from "../engine/decide";
import type { Command, Parsed } from "./commands";
import type { FactChanges } from "../engine/session";

export interface ChatMemory {
  lastIds: string[]; // most recent first (normalised keys)
  lastTerritories: string[];
}

const APP_RE = /\b(?:app(?:lication)?|applicant)[\s#:_-]*0*(\d{1,5})\b/gi;
const TER_RE = /\b(?:ter(?:ritory)?)[\s#:_-]*0*(\d{1,4})\b/gi;
const DEVANAGARI = /[ऀ-ॿ]/;
const KANNADA = /[ಀ-೿]/;
const HINGLISH = /\b(kyun|kyon|kya|hai|hain|nahi|nahin|wala|wali|kaise|kab|abhi|mein|ko|ka|ki)\b/i;

const PRONOUN = /\b(it|its|it's|they|them|their|this one|that one|he|she|her|his|this applicant|that applicant|same applicant)\b/i;
const OTHER = /\b(the other( one)?|other applicant|other one)\b/i;

const STATUS_WORDS: [RegExp, Status][] = [
  [/\b(reject(ed)?|declin(e|ed)|turned down|refused|not selected)\b|अस्वीकार|ರದ್ದು|ತಿರಸ್ಕ/i, "DECLINED"],
  [/\b(on hold|held|hold|pending)\b|होल्ड|रुका|ತಡೆ/i, "ON_HOLD"],
  [/\b(conditional|provisional|reserved)\b/i, "CONDITIONAL"],
  [/\b(wait-?list(ed)?|waiting list|in the queue)\b/i, "WAITLISTED"],
  [/\b(approved|accepted|selected|cleared)\b|मंजूर|ಅನುಮೋದ/i, "APPROVED"],
  [/\b(withdrawn|withdrew|dropped out)\b/i, "WITHDRAWN"],
];

function idsIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(APP_RE)) out.push(`APP-${parseInt(m[1], 10)}`);
  return [...new Set(out)];
}
function tersIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(TER_RE)) out.push(`TER-${parseInt(m[1], 10)}`);
  return [...new Set(out)];
}

function statusIn(text: string): Status | undefined {
  for (const [re, s] of STATUS_WORDS) if (re.test(text)) return s;
  return undefined;
}

export function detectLanguage(text: string): Parsed["language"] {
  if (KANNADA.test(text)) return "Kannada";
  if (DEVANAGARI.test(text)) return "Hindi";
  if (HINGLISH.test(text)) return "Hinglish";
  return "English";
}

/** Split a message into clauses; keeps "compare A and B" together. */
export function clauses(message: string): string[] {
  const parts = message
    .replace(/\s+/g, " ")
    .split(/(?<=[?!;])\s+|;\s*|\n+|(?<=\.)\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    // "APP-7 found a space and APP-10 withdrew": split before the second ID when both halves carry news
    const m = /^(.*?\b(?:app|application)[\s#-]*\d+\b.*?)(?:,\s*|\s+)(?:and|also|plus|while)\s+(.*\b(?:app|application)[\s#-]*\d+\b.*)$/i.exec(p);
    if (m && UPDATE_HINT.test(m[1]) && UPDATE_HINT.test(m[2]) && !/\b(compare|beat|versus|vs|between|ahead of)\b/i.test(p)) out.push(m[1].trim(), m[2].trim());
    else out.push(p);
  }
  return out;
}

const UPDATE_HINT = /(withdr|backed out|pulled out|dropped out|found|has a|got a|secured|signed|sq ?ft|sqft|square|ground|floor|mall|upper|lakh|crore|lac|\bcr\b|rented|leased|owned|bought|fell through|lost the|pin(?: code)? (?:is|to|changed|now)|moves? to|relocat|shift|experience|months|slots?|मिल गई|मिल गया|जगह|दुकान|वर्ग|फुट|फ़ुट|फ्लोर|मंजिल|लाख|करोड़|वापस|किराय|ಸಿಕ್ಕಿದೆ|ಜಾಗ|ಅಂಗಡಿ|ಚದರ|ಅಡಿ|ಮಹಡಿ|ಲಕ್ಷ|ಹಿಂಪಡೆ|ಬಾಡಿಗೆ|jagah|dukaan|mil gay|wapas)/i;

function hypothetical(text: string): boolean {
  return /\b(what if|suppose|supposing|imagine|hypothetical(ly)?|would happen if|simulate|what would happen)\b/i.test(text) && !/simulate \d+ days/i.test(text);
}

export function extractFacts(text: string, current?: { space: SpaceKind | null; size: number | null; floor: Floor | null }): { changes: FactChanges; missing: string[]; notes: string[] } {
  const t = text.toLowerCase();
  const changes: FactChanges = {};
  const missing: string[] = [];
  const notes: string[] = [];

  // site lost
  if (/(lease|deal|space|site|shop|property)( has| had)? (fell|fallen|falls) through|lost (the|his|her|their) (space|shop|site|lease)|no longer has (a|the) (space|shop|site)|landlord (backed out|cancelled)|space is gone|without a space now/.test(t)) {
    changes.space = "None";
    changes.size = null;
    changes.floor = null;
    return { changes, missing, notes };
  }
  // tenure
  let found = false;
  if (/\b(owned|owns|bought|purchased|own (a|the|his|her) (space|shop|site|premises))\b/.test(t)) changes.space = "Owned";
  else if (/\b(rented|on rent|leased|signed a lease|rents|renting|lease signed)\b/.test(t)) changes.space = "Rented";
  if (/\b(found|got|has|have|secured|identified|located|finali[sz]ed)\b.{0,25}\b(space|shop|site|unit|premises|place|location|property)\b/.test(t) || /जगह मिल|दुकान मिल|ಜಾಗ ಸಿಕ್ಕಿ|ಅಂಗಡಿ ಸಿಕ್ಕಿ|jagah mil|dukaan mil/.test(t) || changes.space) found = true;

  // size
  const sz = /(\d[\d,]*(?:\.\d+)?)\s*(sq\.?\s*ft|sqft|sft|square feet|sq feet|sq\.?\s*m\b|sqm|square met(?:er|re)s?|sq\.?\s*yards?|gaj|वर्ग\s*(?:फुट|फ़ुट)|स्क्वायर\s*(?:फुट|फ़ुट)|ಚದರ\s*ಅಡಿ)/i.exec(text);
  if (sz) {
    let v = parseFloat(sz[1].replace(/,/g, ""));
    if (/m\b|met/i.test(sz[2]) && !/ft|feet/i.test(sz[2])) {
      v = Math.round(v * 10.764);
      notes.push(`converted ${sz[1]} sq m to ${v} sq ft`);
    } else if (/yard|gaj/i.test(sz[2])) {
      v = Math.round(v * 9);
      notes.push(`converted ${sz[1]} sq yards to ${v} sq ft`);
    }
    changes.size = v;
  }
  // floor
  if (/ground[- ]?floor|\bground\b|ग्राउंड|भूतल|ನೆಲ ?ಮಹಡಿ/.test(t)) changes.floor = "Ground";
  else if (/\bmall\b/.test(t)) changes.floor = "Mall";
  else if (/(first|1st|second|2nd|upper|top)[- ]?floor|upstairs/.test(t)) changes.floor = "Upper";

  // pin / relocation
  const pin = /(?:pin(?: ?code)?|pincode|moves? to|moving to|relocat\w* to|shift\w* to|now (?:at|in))\D{0,12}(\d{6})/i.exec(text);
  if (pin) changes.pin = pin[1];

  // investment
  const inv = /(?:₹|rs\.?\s*)?(\d+(?:\.\d+)?)\s*(lakh|lac|crore|cr\b|l\b)/i.exec(text);
  if (inv && /(invest|fund|capital|budget|money|lakh|lac|crore|arrang|put in)/i.test(text)) changes.invest = parseFloat(inv[1]) * (/cr/i.test(inv[2]) ? 100 : 1);
  const rupees = /₹\s*(\d{1,2},\d{2},\d{3}|\d{6,})/.exec(text);
  if (!changes.invest && rupees) changes.invest = parseFloat(rupees[1].replace(/,/g, "")) / 1e5;

  // experience
  const exp = /(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\s*(?:of\s*)?(?:retail\s*)?experience|experience\s*(?:is|of|=|:)?\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)?/i.exec(text);
  if (exp) changes.experience = parseFloat(exp[1] ?? exp[2]);

  // target
  const tgt = /(?:open|launch|start|target\w*)\D{0,20}(\d{1,2})\s*months?/i.exec(text);
  if (tgt && !sz?.[0].includes(tgt[1])) changes.targetMonths = parseInt(tgt[1], 10);

  // language
  const lang = /(?:prefers?|training in|language (?:is|to))\s*(kannada|hindi|english)/i.exec(text);
  if (lang) changes.language = (lang[1][0].toUpperCase() + lang[1].slice(1).toLowerCase()) as FactChanges["language"];

  // partial news: a site was found but details are missing
  if (found) {
    if (!changes.space) {
      if (current?.space === "Owned" || current?.space === "Rented") changes.space = current.space;
      else {
        changes.space = "Rented";
        notes.push("tenure was not stated, so the space is treated as rented until confirmed");
        missing.push("whether the space is owned or rented");
      }
    }
    if (changes.size === undefined && !current?.size) missing.push("size in sq ft");
    if (changes.floor === undefined && (!current?.floor || current.floor === "Unknown")) missing.push("floor");
  }
  return { changes, missing, notes };
}

function policyFrom(text: string): { path: "bars.approval" | "bars.decline" | "capex.declineBelowPct" | "spacing.km" | "capex.bufferPct"; value: number } | null {
  const t = text.toLowerCase();
  const num = (re: RegExp) => {
    const m = re.exec(t);
    return m ? parseFloat(m[1]) : null;
  };
  let v: number | null;
  if (/approv\w* (bar|threshold|cut-?off|score)|bar for approval/.test(t) && (v = num(/(?:bar|threshold|cut-?off|score)\D{0,20}(\d+(?:\.\d+)?)/)) !== null) return { path: "bars.approval", value: v };
  if (/declin\w* (bar|threshold|cut-?off)/.test(t) && (v = num(/(?:bar|threshold|cut-?off)\D{0,20}(\d+(?:\.\d+)?)/)) !== null) return { path: "bars.decline", value: v };
  if (/(funding|investment) (floor|minimum)/.test(t) && (v = num(/(?:floor|minimum)\D{0,20}(\d+(?:\.\d+)?)/)) !== null) return { path: "capex.declineBelowPct", value: v };
  if (/spacing/.test(t) && (v = num(/spacing\D{0,20}(\d+(?:\.\d+)?)/)) !== null) return { path: "spacing.km", value: v };
  if (/buffer/.test(t) && (v = num(/buffer\D{0,20}(\d+(?:\.\d+)?)/)) !== null) return { path: "capex.bufferPct", value: v };
  if (/\bbar\b/.test(t) && (v = num(/bar\D{0,20}(\d+(?:\.\d+)?)/)) !== null) return { path: "bars.approval", value: v };
  return null;
}

const ONLY_CODE: [RegExp, string][] = [
  [/floor/, "FLOOR_UNKNOWN"],
  [/size|sq ?ft/, "SPACE_SIZE_MISSING"],
  [/fund|money|capital/, "FUNDING_GAP"],
  [/loan/, "LOAN_DEPENDENT"],
  [/city|mismatch/, "CITY_PIN_MISMATCH"],
  [/pin/, "PIN_MISSING"],
  [/identity|duplicate|same name/, "FUZZY_IDENTITY"],
  [/same property/, "SAME_PROPERTY_CLAIM"],
  [/rupee|unit/, "UNIT_ERROR"],
];

export function parseRules(message: string, ds: Dataset, mem: ChatMemory): Parsed & { memory: ChatMemory } {
  const language = detectLanguage(message);
  const commands: Command[] = [];
  let lastIds = [...mem.lastIds];
  let lastTers = [...mem.lastTerritories];
  const known = (k: string) => ds.applications.some((a) => a.key === k || a.key.split("#")[0] === k);

  for (const raw of clauses(message)) {
    const c = raw.toLowerCase();
    let ids = idsIn(raw);
    let ters = tersIn(raw);
    // bare "7" after "app" handled by APP_RE; pronouns and "the other one"
    if (!ids.length && OTHER.test(c)) {
      if (lastIds.length >= 2) ids = [lastIds[1]];
      else if (lastIds.length === 1 && /same pin/.test(c)) {
        const me = ds.applications.find((a) => a.key === lastIds[0]);
        const others = ds.applications.filter((a) => a.pin && a.pin === me?.pin && a.key !== me?.key);
        if (others.length >= 1) ids = others.map((o) => o.key).slice(0, 3);
        else {
          commands.push({ intent: "help", reason: `No other application uses pin ${me?.pin ?? "?"}${me ? ` besides ${me.id}` : ""}. Which ID do you mean?` });
          continue;
        }
      } else if (lastIds.length === 1) {
        commands.push({ intent: "help", reason: `I only know about ${ds.applications.find((a) => a.key === lastIds[0])?.id ?? lastIds[0]} so far. Which ID do you mean by "the other one"?` });
        continue;
      }
    } else if (!ids.length && PRONOUN.test(c) && lastIds.length) ids = [lastIds[0]];
    if (!ters.length && /\b(that territory|this territory|same territory|there)\b/.test(c) && lastTers.length) ters = [lastTers[0]];

    const hypo = hypothetical(c);

    // ---- session controls ----
    if (/^\s*(undo|revert|take (that|it) back|go back|cancel (that|the last))\b/.test(c) || /\bundo (that|the last|it)\b/.test(c)) {
      commands.push({ intent: "undo" });
      continue;
    }
    if (/^\s*(reset|start over|clear (all|everything)|back to (the )?(original|baseline))\b/.test(c)) {
      commands.push({ intent: "reset" });
      continue;
    }
    if (/confirm (the )?swap|approve the swap|do the swap|go ahead with the swap/.test(c)) {
      commands.push({ intent: "confirm_swap", ids: ids.length ? ids : undefined });
      continue;
    }
    if (/^\s*(apply|commit|apply (it|that|this|the change)|yes,? apply|make it so|go ahead|do it)\s*[.!]?\s*$/.test(c)) {
      commands.push({ intent: "apply" });
      continue;
    }
    const days = /(simulate|skip|fast[- ]forward|after|pass)\D{0,12}(\d{1,2})\s*days/.exec(c);
    if (days) {
      commands.push({ intent: "simulate_days", days: parseInt(days[2], 10) });
      continue;
    }
    if (/\b(mark|is now|has been|got|now) verified\b|\bverify\b.*\b(done|complete)\b/.test(c) && ids.length) {
      commands.push({ intent: "verify", id: ids[0] });
      continue;
    }

    // ---- policy ----
    const pol = policyFrom(c);
    if (pol && !ids.length) {
      commands.push({ intent: "policy_change", path: pol.path, value: pol.value, hypothetical: hypo || !/\b(set|change|make|raise|lower|update)\b/.test(c) });
      continue;
    }

    // ---- territory updates ----
    if (ters.length && !ids.length) {
      const slots = /(\d{1,2})\s*(?:open\s*|free\s*|more\s*)?slots?|slots?\D{0,12}(\d{1,2})/.exec(c);
      const addPins = /add(?:ing|ed)?\s*(?:pin(?:s| codes?)?)?\s*([\d,\s]+?)\s*(?:to|in)\b/.exec(c);
      const removePins = /remov(?:e|ed|ing)\s*(?:pin(?:s| codes?)?)?\s*([\d,\s]+)/.exec(c);
      const prio = /priority\D{0,10}(high|medium|low)|(high|medium|low)\s*priority/.exec(c);
      const isUpdate = (slots && /(now|has|have|got|increase|reduce|set|change|make|becomes?|to \d|what if|suppose)/.test(c)) || addPins || removePins || (prio && /(now|set|change|make|raise|lower)/.test(c));
      if (isUpdate) {
        const pins = (m: RegExpExecArray | null) => (m ? (m[1].match(/\d{6}/g) ?? []) : undefined);
        commands.push({
          intent: "territory_change",
          territory: ters[0],
          slots: slots ? parseInt(slots[1] ?? slots[2], 10) : undefined,
          addPins: pins(addPins),
          removePins: pins(removePins),
          priority: prio ? ((prio[1] ?? prio[2])[0].toUpperCase() + (prio[1] ?? prio[2]).slice(1)) as "High" : undefined,
          hypothetical: hypo,
        });
        lastTers = [ters[0], ...lastTers.filter((x) => x !== ters[0])];
        continue;
      }
    }

    // ---- territory questions ----
    if (/\bterritor(y|ies)\b/.test(c) && /(unfilled|open|free|empty|spare|vacant|remaining|left|available) (slots?|capacity)|slots? (left|open|unfilled|remaining|free)|room left|capacity left/.test(c) && !ters.length) {
      commands.push({ intent: "territory_status", territories: [], filter: "unfilled" });
      continue;
    }
    if (/(next in line|queue|waiting list|wait-?list|who is next|who's next|who comes next)/.test(c)) {
      if (ters.length || ids.length) {
        commands.push({ intent: "queue", territories: ters.length ? ters : undefined, ids: ids.length ? ids : undefined });
        if (ters.length) lastTers = [...ters, ...lastTers];
        if (ids.length) lastIds = [...ids, ...lastIds.filter((x) => !ids.includes(x))];
        continue;
      }
    }
    if (ters.length && !ids.length) {
      commands.push({ intent: "territory_status", territories: ters });
      lastTers = [...ters, ...lastTers.filter((x) => !ters.includes(x))];
      continue;
    }
    if (/\b(all|every|each) territor(y|ies)\b|territor(y|ies) (status|summary|overview)/.test(c)) {
      commands.push({ intent: "territory_status", territories: [] });
      continue;
    }

    // ---- aggregate questions ----
    if (!ids.length && /\b(how many|which (applications|apps|applicants|ones|partners)|list|show (me )?(all|the)|count|who (is|are))\b/.test(c)) {
      const statuses: Status[] = [];
      for (const [re, s] of STATUS_WORDS) if (re.test(c)) statuses.push(s);
      let onlyCode: string | undefined;
      if (/only|just|solely/.test(c) && /(missing|blocked|because of|due to)/.test(c)) for (const [re, code] of ONLY_CODE) if (re.test(c)) { onlyCode = code; break; }
      if (!onlyCode && /(missing|blocked) .*floor|floor info/.test(c)) onlyCode = "FLOOR_UNKNOWN";
      commands.push({ intent: "list", status: statuses.length ? statuses : undefined, onlyCode });
      continue;
    }
    if (!ids.length && /\b(summary|summari[sz]e|overview|overall|totals?|how did (it|we) (go|do)|big picture)\b/.test(c)) {
      commands.push({ intent: "summary" });
      continue;
    }

    // ---- applicant-specific ----
    if (ids.length) {
      // two-ID comparisons
      if (ids.length >= 2 && /(beat|beats|won over|win over|outrank|rank(ed)? (above|ahead|higher)|ahead of|over|chosen over|preferred over|instead of)/.test(c) && /\bwhy\b|\bhow\b|explain/.test(c)) {
        commands.push({ intent: "rank_explain", ids: [ids[0], ids[1]] });
      } else if (ids.length >= 2 && /\b(compare|comparison|versus|vs\.?|difference between|between)\b/.test(c)) {
        commands.push({ intent: "compare", ids: [ids[0], ids[1]] });
      } else if (/(withdr[ae]w|withdrawn|backed out|pulled out|dropped out|no longer interested|quit|cancel(l?ed)? (the |their |his |her )?application|not interested anymore|वापस ले|ಹಿಂಪಡೆ)/.test(c)) {
        commands.push({ intent: "withdraw", id: ids[0], hypothetical: hypo });
      } else if (/(what would it take|what would change|how (can|could) .* (get|be) (approved|accepted|selected)|what (does|do) .* need to|how to (fix|unblock)|what is missing|what's missing)/.test(c)) {
        commands.push({ intent: "what_would_it_take", ids });
      } else if (/(next steps?|what (should|does|must|will) .* (do|happen) next|what now|onboard|training|prepared|prepare|timeline|plan for|how will .* be (trained|prepared|ready))/.test(c)) {
        commands.push({ intent: "next_steps", ids });
      } else if (UPDATE_HINT.test(c) && !/^\s*(why|how come|explain)\b/.test(c)) {
        const app = ds.applications.find((a) => a.key === ids[0] || a.key.split("#")[0] === ids[0]);
        const f = extractFacts(raw, app ? { space: app.space, size: app.size, floor: app.floor } : undefined);
        if (Object.keys(f.changes).length) {
          commands.push({ intent: "update_facts", id: ids[0], changes: f.changes, missing: f.missing.length ? f.missing : undefined, hypothetical: hypo, summary: f.notes.join("; ") || undefined });
        } else commands.push({ intent: "explain", ids, premise: statusIn(c) });
      } else {
        const premise = /\b(why|how come|reason|explain|what happened|kyun|kyon|क्यों|ಏಕೆ|ಯಾಕೆ)\b/i.test(raw) || /\b(is|was)\b/.test(c) ? statusIn(c) : undefined;
        commands.push({ intent: "explain", ids, premise });
      }
      lastIds = [...ids, ...lastIds.filter((x) => !ids.includes(x))].slice(0, 6);
      continue;
    }

    commands.push({ intent: "help", reason: unknownReason(raw, language) });
  }
  void known;
  return { commands, language, memory: { lastIds, lastTerritories: lastTers } };
}

function unknownReason(raw: string, lang: Parsed["language"]): string {
  if (lang === "Hindi" || lang === "Kannada") return `Rule-based mode cannot read ${lang} text without an application ID. Please include the ID (for example APP-007) or write in English.`;
  if (/\b\d{1,3}\b/.test(raw) && /\b(app|application)\b/i.test(raw) === false && /\bwhy\b/i.test(raw)) return `Which application do you mean? Write it as APP-007 or "app 7".`;
  return "I can explain a decision, give next steps, compare two applications, show a territory or queue, apply new facts (space, size, floor, investment, pin, withdrawal, slots), simulate a what-if, undo, or summarise.";
}

export { normaliseId, cityRefs };
