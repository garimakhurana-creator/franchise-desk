// "What would change this decision": try small candidate changes, re-run the engine, report what flips.
import { capex, idealSize, minSize } from "./assess";
import { run } from "./decide";
import type { Policy } from "./policy";
import { statusOrder, type Step } from "./session";
import type { Application, Dataset, Decision, Status } from "./types";

export interface WhatIf {
  change: string;
  from: Status;
  to: Status;
  improves: boolean;
}

const STATUS_WORD: Record<Status, string> = { APPROVED: "Approved", CONDITIONAL: "Conditional", ON_HOLD: "On hold", WAITLISTED: "Waitlisted", DECLINED: "Declined", WITHDRAWN: "Withdrawn" };
export const statusWord = (s: Status) => STATUS_WORD[s];

function withApp(ds: Dataset, key: string, patch: Partial<Application>): Dataset {
  return { ...ds, applications: ds.applications.map((a) => (a.key === key ? { ...a, ...patch } : a)) };
}

export function counterfactuals(step: Step, key: string, today: string): WhatIf[] {
  const { dataset: ds, policy, pinned, result } = step;
  const d = result.decisions.find((x) => x.key === key);
  const app = ds.applications.find((a) => a.key === key);
  if (!d || !app || d.status === "WITHDRAWN") return [];
  const tier = d.capex?.tier ?? 2;
  const terr = result.territories.find((t) => t.key === d.territoryKey);
  const taken = new Set(result.decisions.filter((x) => x.allocatedPin).map((x) => x.allocatedPin));
  const freePin = terr?.freePins.find((p) => !taken.has(p) && p !== app.pin);
  const cands: { change: string; ds?: Dataset; slotsPlus?: boolean }[] = [];

  const has = (c: string) => d.codes.includes(c as never);
  // fixes for holds
  const fix: Partial<Application> = {};
  const fixWords: string[] = [];
  if (has("SPACE_SIZE_MISSING")) {
    fix.size = idealSize(policy, tier);
    fixWords.push(`size given (${fix.size} sq ft)`);
  }
  if (has("FLOOR_UNKNOWN")) {
    fix.floor = "Ground";
    fixWords.push("floor confirmed as ground");
  }
  if (has("PIN_HAS_STORE") && freePin) {
    fix.pin = freePin;
    fixWords.push(`site moved to free pin ${freePin}`);
  }
  if (has("CITY_PIN_MISMATCH") && app.pin) {
    fix.city = null;
    fixWords.push(`city corrected to match pin ${app.pin}`);
  }
  if (has("UNIT_ERROR") && app.invest) {
    fix.invest = app.invest / 1e5;
    fixWords.push(`amount confirmed as ₹${Math.round(app.invest / 1e4) / 10} lakh`);
  }
  if (has("NOTE_CONFLICT") && app.invest !== null) {
    fix.notes = "";
    fixWords.push(`amount confirmed as ₹${app.invest} lakh`);
  }
  if (has("SPACE_CONTRADICTION") && app.space === "None") {
    fix.space = "Rented";
    fixWords.push("space confirmed as rented");
  }
  if (has("FUNDING_GAP") && d.capex) {
    fix.invest = Math.ceil(d.capex.required);
    fixWords.push(`proof of ₹${Math.ceil(d.capex.required)} lakh`);
  }
  if (has("SPACE_SMALL")) {
    fix.size = minSize(policy, tier);
    fixWords.push(`a ${fix.size} sq ft space`);
  }
  if (fixWords.length) cands.push({ change: fixWords.join(" and "), ds: withApp(ds, key, fix) });

  if (d.status === "WAITLISTED" || d.status === "CONDITIONAL" || d.status === "DECLINED") {
    if (freePin && (has("PIN_TAKEN") || has("ADJACENCY") || has("FUZZY_IDENTITY"))) cands.push({ change: `a site in free pin ${freePin}`, ds: withApp(ds, key, { pin: freePin }) });
    if (!d.ready && app.space === "None" && freePin) cands.push({ change: `a rented ${idealSize(policy, tier)} sq ft ground-floor site at pin ${freePin}`, ds: withApp(ds, key, { space: "Rented", size: idealSize(policy, tier), floor: "Ground", pin: freePin }) });
    if (terr) cands.push({ change: `one more open slot in ${terr.id}`, slotsPlus: true });
    if (app.invest !== null) cands.push({ change: `₹5 lakh more investment (₹${app.invest + 5} lakh)`, ds: withApp(ds, key, { invest: app.invest + 5 }) });
    if (app.floor && app.floor !== "Ground" && app.space !== "None") cands.push({ change: "a ground-floor space instead", ds: withApp(ds, key, { floor: "Ground" }) });
  }
  if (has("INVEST_LOW") && d.capex) cands.push({ change: `investment of ₹${Math.ceil(d.capex.required)} lakh (the full estimate)`, ds: withApp(ds, key, { invest: Math.ceil(d.capex.required) }) });
  if (has("OUT_OF_TERRITORY") && d.redirect) {
    const p = d.redirect.match(/\d{6}/)?.[0];
    if (p) cands.push({ change: `a site at pin ${p} in an open territory`, ds: withApp(ds, key, { pin: p }) });
  }

  const out: WhatIf[] = [];
  for (const c of cands) {
    let next = c.ds ?? ds;
    if (c.slotsPlus && terr) next = { ...ds, territories: ds.territories.map((t) => (t.key === terr.key ? { ...t, slots: (t.slots ?? 0) + 1 } : t)) };
    const r = run(next, policy, { today, pinned });
    const nd = r.decisions.find((x) => x.key === key);
    if (!nd) continue;
    out.push({ change: c.change, from: d.status, to: nd.status, improves: statusOrder(nd.status) > statusOrder(d.status) });
  }
  return out;
}

/** One plain sentence for the decision card. */
export function counterfactualSentence(step: Step, d: Decision, today: string, policy: Policy): string {
  if (d.status === "APPROVED" || d.status === "CONDITIONAL") {
    const c = d.capex;
    const floor = c ? Math.round(c.required * 10) / 10 : null;
    return `It would move back only if the site were lost${floor ? `, or proven funds fell below the ₹${floor} lakh estimate` : ""}${d.status === "CONDITIONAL" ? ", or the 30-day reservation lapsed" : ""}.`;
  }
  const w = counterfactuals(step, d.key, today);
  const best = w.find((x) => x.improves);
  if (best) return `Smallest change that helps: ${best.change} would move it from ${statusWord(best.from)} to ${statusWord(best.to)}.`;
  if (w.length) return `None of the small changes tested (${w.map((x) => x.change).slice(0, 3).join("; ")}) would change the outcome on their own.`;
  void policy;
  void capex;
  return "No small change to this application alone would change the outcome.";
}
