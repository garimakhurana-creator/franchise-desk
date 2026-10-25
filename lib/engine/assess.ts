// Capex estimate and the 0-100 score. Names and language never enter here.
import { nearestStore } from "./geo";
import { tierKey, type Policy } from "./policy";
import { businessRelevance } from "./signals";
import type { Capex, Floor, Nearest, Priority, Score, ScoreComponent, SpaceKind, Store, Tier } from "./types";

const r1 = (n: number) => Math.round(n * 10) / 10;

export interface ScoreInput {
  invest: number | null; // conservative value in lakh
  experience: number | null;
  business: string;
  space: SpaceKind | null;
  size: number | null;
  floor: Floor | null;
  targetMonths: number | null;
  pin: string | null;
  tier: Tier;
  priority: Priority | null;
}

export function capex(policy: Policy, tier: Tier, space: SpaceKind | null, size: number | null, invest: number | null): Capex {
  const c = policy.capex;
  const t = tierKey(tier);
  const sizeAssumed = !(size && size > 0) || space === "None" || space === null;
  const sizeUsed = sizeAssumed ? c.idealSize[t] : (size as number);
  const fit = c.fitoutPerSqft[t];
  const stock = c.stockPerSqft[t];
  const fitoutStock = ((fit + stock) * sizeUsed) / 1e5;
  const rentM = (c.rentPerSqftMonth[t] * sizeUsed) / 1e5;
  const owned = space === "Owned";
  const deposit = owned ? 0 : rentM * c.depositMonths;
  const runway = owned ? 0 : rentM * c.runwayMonths;
  const fee = c.franchiseFeeLakh[t];
  const base = fitoutStock + fee + deposit + runway;
  const buffer = (base * c.bufferPct) / 100;
  const required = base + buffer;
  return {
    tier,
    sizeUsed,
    sizeAssumed,
    fitoutPerSqft: fit,
    stockPerSqft: stock,
    fitoutStock: r1(fitoutStock),
    franchiseFee: fee,
    deposit: r1(deposit),
    runway: r1(runway),
    buffer: r1(buffer),
    required: r1(required),
    invest,
    ratio: invest === null ? null : Math.round((invest / required) * 100) / 100,
    monthlyRent: Math.round(rentM * 100) / 100,
  };
}

export function idealSize(policy: Policy, tier: Tier) {
  return policy.capex.idealSize[tierKey(tier)];
}
export function minSize(policy: Policy, tier: Tier) {
  return policy.capex.minSize[tierKey(tier)];
}

export function pathWeeks(policy: Policy, space: SpaceKind | null, floor: Floor | null, tier: Tier): number {
  const tl = policy.timeline;
  const site = tl.siteWeeks[(space ?? "None") as keyof typeof tl.siteWeeks] ?? 6;
  const extra = tl.fitoutExtra[(floor ?? "Unknown") as keyof typeof tl.fitoutExtra] ?? 0;
  return tl.kycAgreementWeeks + site + tl.fitoutWeeks + extra + tl.stockPosWeeks + (tier === 3 ? tl.tier3LogisticsWeeks : 0);
}

export function score(policy: Policy, x: ScoreInput, stores: Store[], asOfYear: number): { score: Score; nearest: Nearest | null; capex: Capex } {
  const sp = policy.score;
  const cx = capex(policy, x.tier, x.space, x.size, x.invest);
  const comps: ScoreComponent[] = [];

  // Capital adequacy
  let cap = 0;
  const ratio = cx.ratio;
  if (ratio !== null) {
    if (ratio >= sp.capital.fullAtRatio) cap = sp.capital.max;
    else if (ratio >= 1) cap = sp.capital.atRatioOne + ((sp.capital.max - sp.capital.atRatioOne) * (ratio - 1)) / (sp.capital.fullAtRatio - 1);
    else if (ratio >= 0.7) cap = (sp.capital.atRatioOne * (ratio - 0.7)) / 0.3;
  }
  comps.push({ key: "capital", label: "Funds vs estimate", value: r1(cap), max: sp.capital.max, note: ratio === null ? "investment not known" : `₹${r1(x.invest!)} lakh vs ₹${cx.required} lakh estimate (${Math.round(ratio * 100)}%)` });

  // Experience and business relevance
  const yrs = Math.max(0, Math.min(x.experience ?? 0, sp.experience.yearsCap));
  const rel = businessRelevance(x.business);
  const relPts = rel === "strong" ? sp.experience.relevancePoints : rel === "partial" ? sp.experience.relevancePoints / 2 : 0;
  const exp = (sp.experience.yearsPoints * yrs) / sp.experience.yearsCap + relPts;
  comps.push({ key: "experience", label: "Experience", value: r1(exp), max: sp.experience.max, note: `${x.experience ?? 0} years; business ${rel === "strong" ? "directly relevant" : rel === "partial" ? "partly relevant" : "not clearly retail"}` });

  // Space readiness
  let spc = 0;
  let spNote = "";
  if (x.space === "Owned" || x.space === "Rented") {
    const ten = sp.space.tenure[x.space];
    const ideal = idealSize(policy, x.tier);
    const min = minSize(policy, x.tier);
    let sz = 0;
    if (x.size) {
      if (x.size >= ideal) sz = x.size > ideal * 3 ? sp.space.sizePoints * 0.75 : sp.space.sizePoints;
      else if (x.size >= min) sz = sp.space.sizePoints / 2 + ((sp.space.sizePoints / 2) * (x.size - min)) / (ideal - min);
      else if (x.size >= min * 0.7) sz = sp.space.sizePoints / 4;
    }
    const profile = (policy.brand.formatProfile === "logistics" ? "logistics" : "retail") as "retail" | "logistics";
    const fl = sp.space.floor[profile][(x.floor ?? "Unknown") as Floor] ?? 0;
    spc = ten + sz + fl;
    spNote = `${x.space.toLowerCase()}, ${x.size ?? "?"} sq ft vs ${ideal} ideal, ${floorWord(x.floor)}`;
  } else {
    spc = sp.space.noSiteCredit;
    spNote = "no site yet; credit for a free choice of site";
  }
  comps.push({ key: "space", label: "Space readiness", value: r1(spc), max: sp.space.max, note: spNote });

  // Timeline realism
  const need = pathWeeks(policy, x.space, x.floor, x.tier);
  let tl = sp.timeline.unknownPoints;
  let tlNote = `no target given; plan needs ${need} weeks`;
  if (x.targetMonths !== null) {
    const have = x.targetMonths * policy.timeline.weeksPerMonth;
    tl = have >= need ? sp.timeline.max : Math.max(sp.timeline.minPoints, (sp.timeline.max * have) / need);
    tlNote = `target ${x.targetMonths} months (${Math.round(have)} weeks) vs ${need} weeks needed`;
  }
  comps.push({ key: "timeline", label: "Timing", value: r1(tl), max: sp.timeline.max, note: tlNote });

  // Territory priority and cannibalisation
  const pr = x.priority ? sp.territory.priorityPoints[x.priority] : sp.territory.priorityPoints.Medium;
  const near = nearestStore(policy, x.pin, stores, asOfYear);
  const can = Math.max(0, sp.territory.cannibalisationPoints - (near?.penalty ?? 0));
  const terNote = `${x.priority ?? "Medium"} priority; ${near ? `nearest store ${near.storeId} ${near.km !== null ? `${near.km} km` : `pin gap ${near.pinGap}`} (${near.risk} overlap)` : "no store nearby"}`;
  comps.push({ key: "territory", label: "Location", value: r1(pr + can), max: sp.territory.max, note: terNote });

  const total = Math.round(comps.reduce((s, c) => s + c.value, 0));
  return { score: { total, components: comps }, nearest: near, capex: cx };
}

export function floorWord(f: Floor | null): string {
  if (f === "Mall") return "mall unit";
  if (f === "Upper") return "upper floor";
  if (f === "Ground") return "ground floor";
  return "floor not known";
}

export function eligibilityBar(policy: Policy, priority: Priority | null): number {
  return policy.bars.approval + (priority ? policy.bars.priorityAdjust[priority] : 0);
}
