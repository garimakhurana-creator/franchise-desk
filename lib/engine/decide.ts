// The deterministic decision engine: Dataset + Policy + RunContext -> RunResult.
// Pure: no I/O, no clock, no randomness. Same input, same output.
import { capex, eligibilityBar, floorWord, idealSize, minSize, score } from "./assess";
import type { ReasonCode } from "./codes";
import { tooClose } from "./geo";
import { hash, normaliseId, normaliseName } from "./normalise";
import { buildPlan } from "./plan";
import type { Policy } from "./policy";
import reference from "./reference.json";
import { businessYears, readNotes, sameNotes, similarNames, type NoteSignals } from "./signals";
import type {
  Application,
  Ask,
  Capex,
  CityRef,
  Dataset,
  Decision,
  Flag,
  Nearest,
  RunContext,
  RunResult,
  Score,
  Status,
  Store,
  Territory,
  TerritorySummary,
  Tier,
} from "./types";
import { explainAll } from "./explain";

export interface Item {
  code: ReasonCode;
  text: string; // one-liner body (after the status word)
  ask?: Ask;
  detail?: string;
}

export interface TInfo {
  t: Territory;
  storePins: { pin: string; storeId: string }[];
  freePins: string[];
  cap: number;
}

export interface Ev {
  app: Application;
  key: string;
  terr: TInfo | null;
  tier: Tier;
  prefixCity: CityRef | null;
  statedCity: CityRef | null;
  sig: NoteSignals;
  holds: Item[];
  decline: Item | null;
  verify: Flag[];
  info: Flag[];
  investUsed: number | null;
  hasSite: boolean;
  ready: boolean;
  storeAtPin: Store | null;
  score: Score | null;
  capex: Capex | null;
  nearest: Nearest | null;
  bar: number;
  eligible: boolean;
  reserve: boolean;
  identityPeers: string[]; // keys of near-duplicate identities (same person)
  // outcome
  status: Status;
  allocatedPin: string | null;
  phase?: 1 | 2 | 3;
  loss?: { kind: "pin" | "slots" | "adjacent" | "identity" | "reserve" | "contested" | "lapsed"; winner?: Ev; against?: Ev; gap?: number; km?: number | null; pinGap?: number };
  adjacentTo?: { ev: Ev; km: number | null; gap: number };
  pinned: boolean;
  pinReleased?: string;
  promoted?: boolean;
  closed?: boolean;
}

export function compareIds(a: string, b: string): number {
  const ma = a.match(/^([A-Z]*)-(\d+)(#\d+)?$/);
  const mb = b.match(/^([A-Z]*)-(\d+)(#\d+)?$/);
  if (ma && mb) {
    if (ma[1] !== mb[1]) return ma[1] < mb[1] ? -1 : 1;
    const d = Number(ma[2]) - Number(mb[2]);
    if (d) return d;
    return (ma[3] ?? "").localeCompare(mb[3] ?? "");
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Ranking: ready site, then score, then investment, then normalised ID. */
export function rankCompare(a: Ev, b: Ev): number {
  if (a.ready !== b.ready) return a.ready ? -1 : 1;
  const sa = a.score?.total ?? -1;
  const sb = b.score?.total ?? -1;
  if (sa !== sb) return sb - sa;
  const ia = a.investUsed ?? -1;
  const ib = b.investUsed ?? -1;
  if (ia !== ib) return ib - ia;
  return compareIds(a.key, b.key);
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 3).trimEnd() + "..." : s);
const listAnd = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-IN");

export function cityRefs(ds: Dataset): CityRef[] {
  return ds.cities?.length ? ds.cities : reference.cities.map((c) => ({ ...c, tier: c.tier as Tier }));
}

function matchCity(refs: CityRef[], name: string | null): CityRef | null {
  if (!name) return null;
  const n = name.toLowerCase().replace(/[^a-z]/g, "");
  if (!n) return null;
  const alias: Record<string, string> = { bangalore: "bengaluru", mysore: "mysuru", mangalore: "mangaluru", hubli: "hubballidharwad", dharwad: "hubballidharwad", hubballi: "hubballidharwad", belgaum: "belagavi", tumkur: "tumakuru", davangere: "davanagere" };
  const target = alias[n] ?? n;
  return refs.find((r) => r.city.toLowerCase().replace(/[^a-z]/g, "") === target) ?? refs.find((r) => r.city.toLowerCase().replace(/[^a-z]/g, "").startsWith(target.slice(0, 5))) ?? null;
}

export function territoryInfos(ds: Dataset): TInfo[] {
  const storePin = new Map(ds.stores.map((s) => [s.pin, s.id]));
  const seenPin = new Set<string>();
  const sorted = [...ds.territories].sort((a, b) => compareIds(a.key, b.key));
  return sorted.map((t) => {
    const pins = t.pins.filter((p) => !seenPin.has(p));
    pins.forEach((p) => seenPin.add(p));
    const storePins = pins.filter((p) => storePin.has(p)).map((p) => ({ pin: p, storeId: storePin.get(p)! }));
    const freePins = pins.filter((p) => !storePin.has(p));
    return { t: { ...t, pins }, storePins, freePins, cap: Math.max(0, Math.min(t.slots ?? 0, freePins.length)) };
  });
}

export function run(ds: Dataset, policy: Policy, ctx: RunContext): RunResult {
  const asOfYear = Number(ctx.today.slice(0, 4));
  const refs = cityRefs(ds);
  const tinfos = territoryInfos(ds);
  const pinToTerr = new Map<string, TInfo>();
  for (const ti of tinfos) for (const p of ti.t.pins) pinToTerr.set(p, ti);
  const storeByPin = new Map(ds.stores.map((s) => [s.pin, s]));
  const apps = [...ds.applications].sort((a, b) => compareIds(a.key, b.key));
  const lapsed = new Set(ctx.lapsed ?? []);
  const closed = new Set(ctx.closedHolds ?? []);

  const evs: Ev[] = apps.map((app) => evaluate(app));

  // ---------- cross-applicant integrity ----------
  const active = evs.filter((e) => !e.app.withdrawn);
  // Same property: different people, identical pin + size + floor (or identical long notes).
  // Compared within a pin only, so 500 rows stay fast.
  const byPin = new Map<string, Ev[]>();
  for (const e of active) if (e.app.pin) byPin.set(e.app.pin, [...(byPin.get(e.app.pin) ?? []), e]);
  for (const group of byPin.values()) for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const a = group[i];
      const b = group[j];
      const names = similarNames(a.app.name, b.app.name);
      const sameSite = a.hasSite && b.hasSite && a.app.size !== null && a.app.size === b.app.size && a.app.floor === b.app.floor;
      if (names) {
        a.identityPeers.push(b.key);
        b.identityPeers.push(a.key);
        for (const [x, y] of [[a, b], [b, a]] as const)
          x.verify.push({ code: "FUZZY_IDENTITY", text: `Name is close to ${y.app.id} at the same pin; an identity check is needed`, evidence: `"${x.app.name}" and "${y.app.name}"`, task: "Check PAN and Aadhaar to confirm these are different people", owner: "Expansion", provenance: "declared" });
      } else if (sameSite || (a.app.notes && sameNotes(a.app.notes, b.app.notes))) {
        for (const [x, y] of [[a, b], [b, a]] as const) {
          const what = sameSite ? `pin ${x.app.pin}, ${x.app.size} sq ft, ${floorWord(x.app.floor)}` : "near-identical notes";
          x.holds.push({
            code: "SAME_PROPERTY_CLAIM",
            text: `${y.app.id} lists the same property (${what}); title or lease proof decides which one can proceed.`,
            ask: { what: "Send the title deed or registered lease to show who holds the property", from: "Applicant" },
            detail: `Both applications describe the same premises. This is often a family or broker overlap; only one store can open there, so both need a document check.`,
          });
        }
      }
    }
  }
  // One person at several pins: one active allocation per person
  const byName = new Map<string, Ev[]>();
  for (const e of active) if (e.app.name) byName.set(normaliseName(e.app.name), [...(byName.get(normaliseName(e.app.name)) ?? []), e]);
  for (const group of byName.values()) for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const a = group[i];
      const b = group[j];
      if (a.app.pin === b.app.pin) continue;
      a.identityPeers.push(b.key);
      b.identityPeers.push(a.key);
      for (const [x, y] of [[a, b], [b, a]] as const)
        x.verify.push({ code: "SLOT_SQUATTING", text: `Same name as ${y.app.id}${y.app.pin ? ` (pin ${y.app.pin})` : ""}; one reservation per person`, evidence: `"${x.app.name}"`, task: "Confirm identity and which site the applicant wants to pursue", owner: "Expansion", provenance: "declared" });
    }
  }

  // ---------- eligibility after all holds are known ----------
  for (const e of evs) finalise(e);

  // ---------- allocation per territory ----------
  const byTerr = new Map<string, Ev[]>();
  for (const e of evs) if (e.terr) byTerr.set(e.terr.t.key, [...(byTerr.get(e.terr.t.key) ?? []), e]);
  for (const ti of tinfos) allocateTerritory(ti, byTerr.get(ti.t.key) ?? []);

  // ---------- statuses ----------
  for (const e of evs) setStatus(e);

  const decisions = explainAll(evs, { ds, policy, ctx, tinfos, asOfYear, refs });
  const territories = summarise(tinfos, decisions);
  const pinConflicts = countPinConflicts(decisions, ds.stores);
  const runId = hash(
    JSON.stringify({
      a: apps.map((a) => ({ ...a, row: 0, fieldFlags: [] })),
      t: [...ds.territories].sort((a, b) => compareIds(a.key, b.key)).map((t) => ({ ...t, row: 0 })),
      s: ds.stores,
      p: policy,
      d: ctx.today,
      pin: Object.entries(ctx.pinned).sort(),
      l: [...lapsed].sort(),
      c: [...closed].sort(),
    }),
  ).toUpperCase();

  return { decisions, territories, runId, policyVersion: policy.version, pinConflicts, asOf: ctx.today, notes: [] };

  // =================================================================
  function evaluate(app: Application): Ev {
    const sig = readNotes(app);
    const statedCity = matchCity(refs, app.city);
    const prefixCity = app.pin ? refs.find((r) => r.prefix === app.pin!.slice(0, 3)) ?? null : null;
    const terr = app.pin ? pinToTerr.get(app.pin) ?? null : null;
    const tier: Tier = (terr?.t.tier ?? prefixCity?.tier ?? statedCity?.tier ?? 2) as Tier;
    const e: Ev = {
      app,
      key: app.key,
      terr,
      tier,
      prefixCity,
      statedCity,
      sig,
      holds: [],
      decline: null,
      verify: [],
      info: [],
      investUsed: app.invest,
      hasSite: app.space === "Owned" || app.space === "Rented",
      ready: false,
      storeAtPin: app.pin ? storeByPin.get(app.pin) ?? null : null,
      score: null,
      capex: null,
      nearest: null,
      bar: eligibilityBar(policy, terr?.t.priority ?? null),
      eligible: false,
      reserve: false,
      identityPeers: [],
      status: "ON_HOLD",
      allocatedPin: null,
      pinned: false,
    };
    if (app.withdrawn) return e;
    const hold = (i: Item) => e.holds.push(i);
    const S = policy.sanity;

    // Duplicate ID rows
    if (app.key.includes("#") || evsHaveTwin(app)) {
      hold({ code: "DUPLICATE_ID", text: `ID ${app.id.replace(/ \(row \d+\)$/, "")} appears on more than one row with different details; we need to know which row is current.`, ask: { what: `Confirm which row of ${app.id.replace(/ \(row \d+\)$/, "")} is correct`, from: "Expansion" } });
    }

    // Pin
    if (!app.pin) {
      if (!app.pinRaw) hold({ code: "PIN_MISSING", text: `the pin code is blank, so we cannot place row ${app.row} in any territory.`, ask: { what: "Send the 6-digit pin code of the planned store", from: "Applicant" } });
      else hold({ code: "PIN_INVALID", text: `pin "${app.pinRaw}" is not a 6-digit pin code, so we cannot place it in a territory.`, ask: { what: "Send a valid 6-digit pin code", from: "Applicant" } });
    } else if (!prefixCity) {
      // pin outside every allowed city
      e.decline = { code: "OUT_OF_TERRITORY", text: `pin ${app.pin} is outside all ${tinfos.length} territories and outside the cities we serve.`, ask: { what: "Re-apply with a pin in one of our open territories", from: "Applicant" } };
    }

    // City vs pin vs territory
    if (app.pin && prefixCity && statedCity && statedCity.prefix !== prefixCity.prefix) {
      const tName = terr ? ` (${terr.t.id})` : "";
      hold({ code: "CITY_PIN_MISMATCH", text: `form says ${app.city}, but pin ${app.pin} is ${prefixCity.city}${tName}; we need the correct city or pin.`, ask: { what: `Confirm whether the store is in ${app.city} or at pin ${app.pin} (${prefixCity.city})`, from: "Applicant" } });
    } else if (app.pin && terr && terr.t.city && prefixCity && matchCity(refs, terr.t.city)?.prefix !== prefixCity.prefix) {
      hold({ code: "CITY_PIN_MISMATCH", text: `pin ${app.pin} is ${prefixCity.city}, but territory ${terr.t.id} is listed as ${terr.t.city}; the territory sheet needs checking.`, ask: { what: `Check the pin list of ${terr.t.id}`, from: "Expansion" } });
    } else if (!app.city && app.pin && prefixCity) {
      e.info.push({ code: "DATA_MISSING", text: `City was blank; pin ${app.pin} places it in ${prefixCity.city}`, provenance: "declared" });
    }

    // Investment
    if (app.invest === null) {
      const est = capex(policy, tier, app.space, app.size, null);
      if (app.investRaw) hold({ code: "DATA_INVALID", text: `investment "${app.investRaw}" cannot be read as an amount; the estimate for this site is ₹${fmt(est.required)} lakh.`, ask: { what: "Send the investment capacity in ₹ lakh", from: "Applicant" } });
      else hold({ code: "DATA_MISSING", text: `investment is blank; we cannot check it against the ₹${fmt(est.required)} lakh estimate for this site.`, ask: { what: "Send the investment capacity in ₹ lakh", from: "Applicant" } });
    } else if (app.invest >= S.investRupeesThreshold) {
      hold({ code: "UNIT_ERROR", text: `investment ${app.invest.toLocaleString("en-IN")} looks like rupees (₹${fmt(app.invest / 1e5)} lakh), not lakh; please confirm the amount.`, ask: { what: `Confirm the investment: ₹${fmt(app.invest / 1e5)} lakh or ${app.invest.toLocaleString("en-IN")} lakh`, from: "Applicant" } });
      e.investUsed = null;
    } else if (app.invest === 0) {
      hold({ code: "DATA_INVALID", text: `investment is 0 lakh; we need the real amount to compare with the estimate.`, ask: { what: "Send the real investment capacity in ₹ lakh", from: "Applicant" } });
    }
    const rangeFlag = app.fieldFlags.find((f) => f.field === "invest" && /range/.test(f.message));
    if (rangeFlag) e.info.push({ code: "DATA_INVALID", text: `Investment was a range; the lower figure ₹${fmt(app.invest ?? 0)} lakh is used`, evidence: app.investRaw, provenance: "declared" });
    if (sig.investClaim && app.invest !== null && app.invest < S.investRupeesThreshold) {
      const lower = Math.min(sig.investClaim.lakh, app.invest);
      e.investUsed = lower;
      hold({ code: "NOTE_CONFLICT", text: `form says ₹${fmt(app.invest)} lakh but the note says ₹${fmt(sig.investClaim.lakh)} lakh; we use ₹${fmt(lower)} lakh until confirmed.`, ask: { what: `Confirm the investment amount (₹${fmt(app.invest)} or ₹${fmt(sig.investClaim.lakh)} lakh) with a bank statement`, from: "Applicant" } });
    }

    // Experience
    if (app.experience === null) {
      if (app.fieldFlags.some((f) => f.field === "experience")) hold({ code: "DATA_INVALID", text: `retail experience "${app.fieldFlags.find((f) => f.field === "experience")?.message.match(/"(.*)"/)?.[1] ?? "?"}" cannot be read as years.`, ask: { what: "Send years of retail experience (0 if none)", from: "Applicant" } });
      else hold({ code: "DATA_MISSING", text: `retail experience is blank; we need years (0 if none) to score row ${app.row}.`, ask: { what: "Send years of retail experience (0 if none)", from: "Applicant" } });
    } else if (app.experience > S.maxExperienceYears) {
      hold({ code: "DATA_INVALID", text: `retail experience of ${app.experience} years is above the ${S.maxExperienceYears}-year limit we accept; please confirm.`, ask: { what: "Confirm years of retail experience", from: "Applicant" } });
    } else if (app.experience === 0) {
      const by = businessYears(app.business);
      if (by && by > 0) hold({ code: "EXPERIENCE_CONFLICT", text: `experience is 0 years, but the business text says "${app.business}"; we need the correct figure.`, ask: { what: "Confirm years of running or managing a shop", from: "Applicant" } });
    }

    // Space
    if (app.space === null) {
      hold({ code: "DATA_MISSING", text: `"Space available" is ${app.spaceRaw ? `"${app.spaceRaw}", which we cannot read` : "blank"}; we need Owned, Rented or Not yet identified.`, ask: { what: "Say whether the space is Owned, Rented or Not yet identified", from: "Applicant" } });
    } else if (app.space === "None") {
      const bits: string[] = [];
      if (app.size) bits.push(`${app.size} sq ft`);
      if (app.floor && app.floor !== "Unknown") bits.push(floorWord(app.floor));
      if (sig.foundShop) bits.push(`note "${clip(sig.foundShop, 40)}"`);
      if (bits.length) {
        hold({ code: "SPACE_CONTRADICTION", text: `space is "Not yet identified" yet the form lists ${listAnd(bits)}; please confirm.`, ask: { what: "Confirm whether a space exists and, if so, its tenure, size and floor", from: "Applicant" } });
      }
    } else {
      // Owned / Rented
      if (!app.size) {
        hold({ code: "SPACE_SIZE_MISSING", text: `space is ${app.space} but its size is blank; we need the sq ft (Tier ${tier} minimum ${minSize(policy, tier)} sq ft) to check cost and layout.`, ask: { what: "Send the size of the space in sq ft", from: "Applicant" } });
      }
      if (!app.floor || app.floor === "Unknown") {
        hold({ code: "FLOOR_UNKNOWN", text: `the ${app.size ? `${app.size} sq ft ` : ""}space has no floor given; ground, upper or mall changes cost, timeline and footfall.`, ask: { what: "Send the floor of the space: Ground, Upper or Mall unit", from: "Applicant" } });
      } else if (sig.floorClaim && sig.floorClaim.floor !== app.floor) {
        hold({ code: "SPACE_CONTRADICTION", text: `form says ${floorWord(app.floor)}, but the note says "${clip(sig.floorClaim.quote, 40)}"; we need the correct floor.`, ask: { what: "Confirm the floor of the space", from: "Applicant" } });
      }
      if (app.size) {
        const min = minSize(policy, tier);
        if (app.size > S.maxPlausibleSqft) hold({ code: "DATA_INVALID", text: `space size ${app.size.toLocaleString("en-IN")} sq ft is far above any store format; please confirm the size.`, ask: { what: "Confirm the size in sq ft", from: "Applicant" } });
        else if (app.size < min * (policy.capex.smallBelowPct / 100)) {
          const sqm = app.size < S.sqmSuspectBelow ? ` (if this is ${app.size} sq m, it is about ${Math.round(app.size * 10.764)} sq ft)` : "";
          hold({ code: "SPACE_SMALL", text: `${app.size} sq ft is under 70% of the ${min} sq ft Tier ${tier} minimum${sqm}; a larger space is needed.`, ask: { what: `Find a space of at least ${min} sq ft, or confirm the unit used`, from: "Applicant" } });
        }
      }
    }
    if (app.targetMonths !== null && app.targetMonths < 0) hold({ code: "DATA_INVALID", text: `target launch of ${app.targetMonths} months is negative; we need months from today.`, ask: { what: "Send the target launch in months from today", from: "Applicant" } });

    // Pin holds one of our stores
    if (app.pin && terr && e.storeAtPin) {
      if (terr.freePins.length === 0) {
        e.decline = { code: "PIN_HAS_STORE_NO_ALT", text: `pin ${app.pin} has our store ${e.storeAtPin.id}, and ${terr.t.id} has no free pin, so it can host 0 new stores.`, ask: { what: "Re-apply when the brand opens a new territory nearby", from: "Applicant" } };
      } else if (e.hasSite) {
        hold({ code: "PIN_HAS_STORE", text: `pin ${app.pin} already has our store ${e.storeAtPin.id}; the site must move to a free pin in ${terr.t.id}.`, ask: { what: `Move the site to a free pin of ${terr.t.id} (${terr.freePins.join(", ")})`, from: "Applicant" } });
      }
    }

    // Integrity signals from notes: route to a document check, never decline
    if (sig.injection) e.info.push({ code: "INJECTION", text: "The note contains instructions to the system; they were ignored and did not change the score", evidence: sig.injection, provenance: "declared" });
    if (sig.loan) e.verify.push({ code: "LOAN_DEPENDENT", text: "Funding depends on a bank loan", evidence: sig.loan, task: "Send the bank's loan sanction letter", owner: "Applicant", provenance: "declared" });
    if (sig.weakTitle) e.verify.push({ code: "WEAK_TITLE", text: app.space === "Owned" ? "Ownership may not be in the applicant's name alone" : "The lease may be informal or short", evidence: sig.weakTitle, task: app.space === "Owned" ? "Send the title deed, or a no-objection letter from co-owners" : "Send a registered lease with at least 5 years' tenure", owner: "Applicant", provenance: "declared" });
    if (sig.conflict) e.verify.push({ code: "CONFLICT_OF_INTEREST", text: "The note mentions another brand or an exclusivity tie", evidence: sig.conflict, task: "Sign a non-compete declaration", owner: "Legal", provenance: "declared" });
    if (sig.provenOperator) e.info.push({ code: "CONFLICT_OF_INTEREST", text: "Proven operator: says they already run one of our stores; own-store overlap is checked", evidence: sig.provenOperator, provenance: "declared" });
    if (sig.compliance) e.verify.push({ code: "COMPLIANCE_CUE", text: "Funding source needs a KYC review", evidence: sig.compliance, task: "Show the source of funds through bank records", owner: "Legal", provenance: "declared" });
    if (sig.dispute) e.verify.push({ code: "COMPLIANCE_CUE", text: "A legal dispute is mentioned; the agreement waits until it is cleared", evidence: sig.dispute, task: "Share the case status or a clearance letter", owner: "Legal", provenance: "declared" });
    if (sig.unreadable) e.info.push({ code: "DATA_INVALID", text: "The note is in a script the rule-based reader cannot interpret; a person should read it", evidence: app.notes.slice(0, 80), provenance: "declared" });
    if (app.invest !== null && app.invest >= S.outlierInvestLakh && app.invest < S.investRupeesThreshold && (app.experience ?? 0) === 0 && app.space === "None" && (app.targetMonths ?? 99) <= 2) {
      e.verify.push({ code: "CAPACITY_OUTLIER", text: `₹${fmt(app.invest)} lakh with no experience, no site and a ${app.targetMonths}-month target is unusual`, task: "Show proof and source of funds before any agreement", owner: "Legal", provenance: "declared" });
    }
    if (app.floor === "Mall" && tier === 3) e.verify.push({ code: "COMPLIANCE_CUE", text: `A mall unit in a Tier 3 town needs a site visit to confirm`, task: "Field team to visit and photograph the unit", owner: "Field", provenance: "declared" });
    if (/kirana/i.test(app.business) && (app.size ?? 0) >= 2000) e.verify.push({ code: "COMPLIANCE_CUE", text: `A ${app.size} sq ft kirana is unusually large`, task: "Field team to confirm the space size", owner: "Field", provenance: "declared" });
    // Follow-up facts are claimed until verified
    const claimed = Object.entries(app.provenance).filter(([, v]) => v === "claimed").map(([k]) => k);
    if (claimed.length) e.verify.push({ code: "CLAIM_UNVERIFIED", text: `New ${claimed.join(", ")} details came in a follow-up and are not yet verified`, task: app.space === "Owned" ? "Verify with the title deed and a site visit" : app.space === "Rented" ? "Verify with the registered lease and a site visit" : "Verify with a document", owner: "Field", provenance: "claimed" });

    // Score (provisional when holds exist). Names and language never enter.
    if (terr || prefixCity) {
      const sc = score(policy, { invest: e.investUsed, experience: app.experience, business: app.business, space: app.space, size: app.size, floor: app.floor, targetMonths: app.targetMonths, pin: app.pin, tier, priority: terr?.t.priority ?? null }, ds.stores, asOfYear);
      e.score = sc.score;
      e.nearest = sc.nearest;
      e.capex = sc.capex;
    }

    // Capex gates
    if (e.capex && e.investUsed !== null && e.investUsed > 0) {
      const ratio = e.investUsed / e.capex.required;
      const atMin = capex(policy, tier, app.space, minSize(policy, tier), e.investUsed);
      const sizeKnown = !e.capex.sizeAssumed || app.space === "None";
      if (ratio < policy.capex.declineBelowPct / 100 && (sizeKnown || e.investUsed / atMin.required < policy.capex.declineBelowPct / 100) && !e.holds.some((h) => h.code === "NOTE_CONFLICT")) {
        e.decline = e.decline ?? { code: "INVEST_LOW", text: `₹${fmt(e.investUsed)} lakh is ${Math.round(ratio * 100)}% of the ₹${fmt(e.capex.required)} lakh needed for ${e.capex.sizeUsed} sq ft in Tier ${tier}; the floor is ${policy.capex.declineBelowPct}%.`, ask: { what: `Re-apply with at least ₹${fmt(e.capex.required * policy.capex.declineBelowPct / 100)} lakh, a co-investor, or a smaller site`, from: "Applicant" } };
      } else if (ratio < 1) {
        hold({ code: "FUNDING_GAP", text: `₹${fmt(e.investUsed)} lakh covers ${Math.round(ratio * 100)}% of the ₹${fmt(e.capex.required)} lakh estimate; proof of funds or a co-investor is needed.`, ask: { what: `Send proof of ₹${fmt(e.capex.required)} lakh in funds, or add a co-investor for the ₹${fmt(e.capex.required - e.investUsed)} lakh gap`, from: "Applicant" } });
      }
    }

    // Location: pin in no territory
    if (app.pin && prefixCity && !terr && !e.holds.some((h) => h.code === "CITY_PIN_MISMATCH")) {
      const open = tinfos.filter((ti) => matchCity(refs, ti.t.city)?.prefix === prefixCity.prefix && ti.cap > 0);
      e.decline = {
        code: "OUT_OF_TERRITORY",
        text: open.length
          ? `pin ${app.pin} is outside every open territory; ${prefixCity.city} has ${open.map((o) => o.t.id).join(", ")} with free pins.`
          : `pin ${app.pin} (${prefixCity.city}) is outside all ${tinfos.length} open territories, and ${prefixCity.city} has no open territory.`,
        ask: open.length ? { what: `Re-apply with a site in ${open.map((o) => `${o.t.id} (pins ${o.freePins.join(", ")})`).join("; ")}`, from: "Applicant" } : { what: `Re-apply when the brand opens a territory in ${prefixCity.city}`, from: "Applicant" },
      };
    }
    return e;
  }

  function evsHaveTwin(app: Application): boolean {
    return apps.some((o) => o !== app && o.key.split("#")[0] === app.key && o.key !== app.key);
  }

  function finalise(e: Ev) {
    if (e.app.withdrawn) return;
    const app = e.app;
    e.ready = e.hasSite && !!app.size && !!app.floor && app.floor !== "Unknown" && !e.storeAtPin && e.holds.length === 0;
    if (e.decline || e.holds.length || !e.terr || !e.score) return;
    if (e.score.total < policy.bars.decline) {
      const weakest = [...e.score.components].sort((a, b) => a.value / a.max - b.value / b.max).slice(0, 2);
      e.decline = { code: "BELOW_BAR", text: `score ${e.score.total} is below the decline bar of ${policy.bars.decline}; weakest areas: ${weakest.map((w) => `${w.label.toLowerCase()} ${w.value} of ${w.max}`).join(", ")}.`, ask: { what: "Re-apply with a ready site, more funds or more experience", from: "Applicant" } };
      return;
    }
    if (e.score.total < e.bar) {
      e.reserve = true;
      return;
    }
    e.eligible = true;
  }

  function allocate(ti: TInfo, pool: Ev[], usePins: boolean) {
    const alloc = new Map<string, { pin: string | null; phase: 0 | 1 | 2 | 3 }>();
    const usedPins = new Map<string, Ev>();
    const people = new Set<string>();
    const loss = new Map<string, Ev["loss"]>();
    const adjacent = new Map<string, Ev["adjacentTo"]>();
    const released = new Map<string, string>();
    const take = (e: Ev, pin: string | null, phase: 0 | 1 | 2 | 3) => {
      alloc.set(e.key, { pin, phase });
      if (pin) usedPins.set(pin, e);
      people.add(e.key);
      e.identityPeers.forEach((p) => people.add(p));
    };
    // 0. pinned approvals stay unless their own facts no longer support them
    if (usePins) {
      for (const e of [...pool].sort(rankCompare)) {
        const pin = ctx.pinned[e.key];
        if (!pin) continue;
        if (e.eligible && e.ready && e.app.pin === pin && !usedPins.has(pin)) take(e, pin, 0);
        else released.set(e.key, !e.app.pin || e.app.pin !== pin ? `the site is no longer at pin ${pin}` : !e.ready ? "the site is no longer ready" : "it no longer clears the bar");
      }
    }
    const room = () => ti.cap - alloc.size;
    const cands = pool.filter((e) => e.eligible && !alloc.has(e.key) && !lapsed.has(e.key)).sort(rankCompare);
    const deferred: Ev[] = [];
    // 1. ready sites, spaced out
    for (const e of cands.filter((c) => c.ready)) {
      const pin = e.app.pin!;
      if (usedPins.has(pin)) {
        loss.set(e.key, { kind: "pin", winner: usedPins.get(pin) });
        continue;
      }
      if (people.has(e.key)) {
        loss.set(e.key, { kind: "identity", winner: pool.find((p) => alloc.has(p.key) && e.identityPeers.includes(p.key)) });
        continue;
      }
      if (room() <= 0) {
        loss.set(e.key, { kind: "slots" });
        continue;
      }
      const near = [...alloc.entries()].map(([k, v]) => ({ ev: pool.find((p) => p.key === k)!, pin: v.pin })).filter((x) => x.pin).map((x) => ({ ...x, d: tooClose(policy, pin, x.pin!) })).find((x) => x.d.close);
      if (near) {
        deferred.push(e);
        adjacent.set(e.key, { ev: near.ev, km: near.d.km, gap: near.d.gap });
        continue;
      }
      take(e, pin, 1);
    }
    // 2. adjacent ready sites if slots remain
    for (const e of deferred) {
      const pin = e.app.pin!;
      if (usedPins.has(pin)) {
        loss.set(e.key, { kind: "pin", winner: usedPins.get(pin) });
        adjacent.delete(e.key);
        continue;
      }
      if (people.has(e.key)) {
        loss.set(e.key, { kind: "identity" });
        continue;
      }
      if (room() > 0) take(e, pin, 2);
      else loss.set(e.key, { kind: "adjacent" });
    }
    // 3. leftover slots, provisionally, to strong applicants without a site
    for (const e of cands.filter((c) => !c.ready)) {
      if (people.has(e.key)) {
        loss.set(e.key, { kind: "identity" });
        continue;
      }
      if (room() > 0) take(e, null, 3);
      else loss.set(e.key, { kind: "slots" });
    }
    return { alloc, loss, adjacent, released };
  }

  function allocateTerritory(ti: TInfo, pool: Ev[]) {
    const actual = allocate(ti, pool, true);
    const hasPins = pool.some((e) => ctx.pinned[e.key]);
    for (const e of pool) {
      const a = actual.alloc.get(e.key);
      if (a) {
        e.allocatedPin = a.pin;
        e.phase = a.phase === 0 ? 1 : a.phase;
        e.pinned = a.phase === 0;
      } else {
        e.loss = actual.loss.get(e.key);
      }
      const adj = actual.adjacent.get(e.key);
      if (adj) e.adjacentTo = adj;
      const rel = actual.released.get(e.key);
      if (rel) e.pinReleased = rel;
      if (lapsed.has(e.key) && e.eligible && !a) e.loss = { kind: "lapsed" };
    }
    if (!hasPins) return;
    // Contested: who would win without the locks, against which locked approval
    const ideal = allocate(ti, pool, false);
    const displaced = pool.filter((e) => actual.alloc.get(e.key)?.phase === 0 && !ideal.alloc.has(e.key)).sort((a, b) => (a.score?.total ?? 0) - (b.score?.total ?? 0) || compareIds(a.key, b.key));
    const challengers = pool.filter((e) => ideal.alloc.has(e.key) && !actual.alloc.has(e.key) && e.ready).sort(rankCompare);
    challengers.forEach((c, i) => {
      const d = displaced[i];
      if (!d) return;
      c.loss = { kind: "contested", against: d, gap: (c.score?.total ?? 0) - (d.score?.total ?? 0) };
    });
  }

  function setStatus(e: Ev) {
    if (e.app.withdrawn) {
      e.status = "WITHDRAWN";
      return;
    }
    if (e.decline && !(e.decline.code === "OUT_OF_TERRITORY" && e.holds.some((h) => h.code === "CITY_PIN_MISMATCH"))) {
      e.status = "DECLINED";
      return;
    }
    if (e.holds.length) {
      e.status = "ON_HOLD";
      if (closed.has(e.key)) {
        e.status = "DECLINED";
        e.closed = true;
      }
      return;
    }
    if (e.allocatedPin !== null || e.phase === 3) {
      const needsCheck = e.verify.filter((v) => v.code !== "CLAIM_UNVERIFIED").length > 0;
      e.status = e.phase === 3 || needsCheck ? "CONDITIONAL" : "APPROVED";
      if (e.pinned) e.status = "APPROVED";
      return;
    }
    e.status = e.eligible || e.reserve ? "WAITLISTED" : "ON_HOLD";
    if (e.reserve && !e.loss) e.loss = { kind: "reserve" };
  }
}

export function countPinConflicts(decisions: Decision[], stores: Store[]): number {
  const storePins = new Set(stores.map((s) => s.pin));
  const seen = new Map<string, number>();
  let n = 0;
  for (const d of decisions) {
    if ((d.status === "APPROVED" || d.status === "CONDITIONAL") && d.allocatedPin) {
      if (storePins.has(d.allocatedPin)) n++;
      seen.set(d.allocatedPin, (seen.get(d.allocatedPin) ?? 0) + 1);
    }
  }
  for (const c of seen.values()) if (c > 1) n += c - 1;
  return n;
}

function summarise(tinfos: TInfo[], decisions: Decision[]): TerritorySummary[] {
  return tinfos.map((ti) => {
    const ds = decisions.filter((d) => d.territoryKey === ti.t.key);
    const ids = (s: Status) => ds.filter((d) => d.status === s).map((d) => d.id);
    const slots = ti.t.slots ?? 0;
    const approved = ids("APPROVED");
    const conditional = ids("CONDITIONAL");
    let binding: string | null = null;
    if (ti.freePins.length < slots) binding = `${ti.t.id} wants ${slots} store${slots === 1 ? "" : "s"} but ${ti.freePins.length === 0 ? "no pin is" : `only ${ti.freePins.length} pin${ti.freePins.length === 1 ? " is" : "s are"}`} free, so it can host ${ti.cap}.`;
    return {
      key: ti.t.key,
      id: ti.t.id,
      city: ti.t.city,
      tier: ti.t.tier,
      priority: ti.t.priority,
      slots,
      pins: ti.t.pins,
      storePins: ti.storePins,
      freePins: ti.freePins,
      effectiveCapacity: ti.cap,
      bindingReason: binding,
      approved,
      conditional,
      waitlisted: ds.filter((d) => d.status === "WAITLISTED").sort((a, b) => (a.queuePos ?? 99) - (b.queuePos ?? 99)).map((d) => d.id),
      onHold: ids("ON_HOLD"),
      unusedCapacity: Math.max(0, ti.cap - approved.length - conditional.length),
    };
  });
}

export { normaliseId };
