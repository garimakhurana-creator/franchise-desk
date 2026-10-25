// Onboarding plan for partners who move forward: timeline, documents, training, supply, payback.
import { capex, pathWeeks } from "./assess";
import { maturity, pinGap, pinKm } from "./geo";
import { tierKey, type Policy } from "./policy";
import type { Application, Capex, Floor, Plan, PlanStep, SpaceKind, Store, Tier } from "./types";
import type { NoteSignals } from "./signals";

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + Math.round(days));
  return d.toISOString().slice(0, 10);
}

export function addMonths(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00Z");
  const whole = Math.floor(months);
  d.setUTCMonth(d.getUTCMonth() + whole);
  d.setUTCDate(d.getUTCDate() + Math.round((months - whole) * 30));
  return d.toISOString().slice(0, 10);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
export function fmtMonth(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function trainingTrack(policy: Policy, years: number | null) {
  const y = Math.max(0, Math.floor(years ?? 0));
  return policy.training.tracks.find((t) => y >= t.minYears && y <= t.maxYears) ?? policy.training.tracks[0];
}

export function buddyStore(policy: Policy, pin: string | null, stores: Store[], asOfYear: number): { store: Store | null; reason: string } {
  if (!pin) return { store: null, reason: "no pin yet" };
  const ranked = stores
    .map((s) => {
      const km = pinKm(pin, s.pin);
      const gap = pinGap(pin, s.pin);
      const m = maturity(policy, s.year, asOfYear);
      const dist = km ?? (gap === 9999 ? 9999 : gap / 2);
      // Prefer mature stores (3+ years) and then the closest.
      const cost = dist + (m.age >= 3 ? 0 : 15);
      return { s, km, gap, m, cost };
    })
    .filter((x) => x.gap !== 9999 || x.km !== null)
    .sort((a, b) => a.cost - b.cost || a.s.id.localeCompare(b.s.id));
  const pick = ranked[0];
  if (!pick) {
    const any = [...stores].sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999))[0] ?? null;
    return { store: any, reason: any ? `no store in this city; ${any.id} is our longest-running store` : "no store available" };
  }
  const where = pick.km !== null ? `${pick.km} km away` : "in the same city";
  return { store: pick.s, reason: `${pick.s.id} is ${where} and ${pick.m.age} years old (${pick.m.label})` };
}

export interface PlanInput {
  app: Application;
  tier: Tier;
  space: SpaceKind | null;
  floor: Floor | null;
  pin: string | null;
  today: string;
  signals: NoteSignals;
  extraDocs: string[];
  clusterWith: string[];
}

export function buildPlan(policy: Policy, x: PlanInput, stores: Store[], asOfYear: number): Plan {
  const tl = policy.timeline;
  const steps: PlanStep[] = [];
  let w = 1;
  steps.push({ week: w, weeks: tl.kycAgreementWeeks, label: "KYC, document check and franchise agreement", owner: "Legal" });
  w += tl.kycAgreementWeeks;
  const siteW = tl.siteWeeks[(x.space ?? "None") as keyof typeof tl.siteWeeks] ?? 6;
  if (siteW > 0) {
    steps.push({
      week: w,
      weeks: siteW,
      label: x.space === "Rented" ? "Register the lease and complete site survey" : "Find a qualifying site; field team verifies it",
      owner: x.space === "Rented" ? "Field" : "Applicant",
    });
    w += siteW;
  }
  const fit = tl.fitoutWeeks + (tl.fitoutExtra[(x.floor ?? "Unknown") as keyof typeof tl.fitoutExtra] ?? 0);
  const fitStart = w;
  steps.push({ week: w, weeks: fit, label: `Fit-out to brand standard${x.floor === "Mall" ? " (mall approvals add 3 weeks)" : x.floor === "Upper" ? " (upper floor adds 1 week)" : ""}`, owner: "Expansion" });
  const track = trainingTrack(policy, x.app.experience);
  const buddy = buddyStore(policy, x.pin, stores, asOfYear);
  steps.push({ week: fitStart, weeks: track.weeks, label: `${track.name} training (${track.weeks} wk) in ${x.app.language ?? "English"}${buddy.store ? `, shadowing at ${buddy.store.id}` : ""}`, owner: "Training" });
  w += fit;
  steps.push({ week: w, weeks: tl.stockPosWeeks, label: "First stock, POS set-up and competency sign-off", owner: "Supply chain" });
  w += tl.stockPosWeeks;
  if (x.tier === 3) {
    steps.push({ week: w, weeks: tl.tier3LogisticsWeeks, label: "Tier 3 inbound route set-up", owner: "Supply chain" });
    w += tl.tier3LogisticsWeeks;
  }
  const totalWeeks = pathWeeks(policy, x.space, x.floor, x.tier);
  steps.push({ week: totalWeeks + 1, weeks: 1, label: "Go-live", owner: "Expansion" });
  const readyDate = addDays(x.today, totalWeeks * 7);
  const targetDate = x.app.targetMonths !== null ? addMonths(x.today, x.app.targetMonths) : null;
  const feasible = targetDate === null || readyDate <= targetDate;

  const docs = ["PAN and Aadhaar (KYC)", "Bank statements for 6 months or proof of funds"];
  if (x.space === "Owned") docs.push("Title deed or sale deed in the applicant's name");
  if (x.space === "Rented") docs.push("Registered lease with at least 5 years' tenure");
  if (x.space === "None" || x.space === null) docs.push("Lease or deed for the chosen site once found");
  docs.push("Site photos and floor plan", "Trade licence and GST registration", ...x.extraDocs);

  // Supply
  const prefix = (x.pin ?? "").slice(0, 3);
  const hub = policy.supply.hubs.find((h) => h.servesPrefixes.includes(prefix));
  const leadDays = hub ? (hub.leadDays as unknown as Record<string, number>)[prefix] ?? 2 : 3;
  const safety = Math.max(policy.supply.minSafetyStockDays, leadDays * policy.supply.safetyStockDaysPerLeadDay);

  // Payback (illustrative)
  const cx: Capex = capex(policy, x.tier, x.space, x.app.size, x.app.invest);
  const t = tierKey(x.tier);
  const pb = policy.payback;
  const revenue = (pb.revenuePerSqftMonth[t] * cx.sizeUsed) / 1e5;
  const net = revenue * (pb.grossMarginPct / 100) - revenue * ((pb.royaltyPct + pb.otherOpexPct) / 100) - pb.staffCostLakhMonth[t] - cx.monthlyRent;
  const months = net > 0 ? Math.round((cx.required / net) * 10) / 10 : null;

  return {
    steps,
    totalWeeks,
    readyDate,
    targetDate,
    feasible,
    earliestMonth: fmtMonth(readyDate),
    documents: [...new Set(docs)],
    training: {
      track: track.name,
      weeks: track.weeks,
      language: x.app.language ?? "English",
      mode: x.tier === 3 ? policy.training.tier3Mode : policy.training.defaultMode,
      buddyStore: buddy.store?.id ?? null,
      buddyReason: buddy.reason,
    },
    supply: {
      hub: hub?.name ?? "nearest hub (to be assigned)",
      leadDays,
      safetyStockDays: safety,
      cluster: x.clusterWith.length ? `milk run with ${x.clusterWith.join(", ")}` : "single drop",
      note: `${leadDays}-day inbound from ${hub?.name ?? "the nearest hub"}; hold ${safety} days of safety stock; weekly replenishment`,
    },
    payback: { months, flagged: months === null || months > pb.flagAboveMonths, monthlyNet: Math.round(net * 100) / 100, revenue: Math.round(revenue * 100) / 100 },
  };
}

export function nextFestival(policy: Policy, name: string, today: string): { name: string; date: string } | null {
  const n = name.toLowerCase().replace("deepavali", "diwali");
  const f = policy.festivals.filter((x) => x.name.toLowerCase() === n && x.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  return f ?? null;
}
