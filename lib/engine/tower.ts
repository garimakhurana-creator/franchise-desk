// Control tower: funnel, expected openings, who to call first, demand gap, capacity plan.
// Opening probabilities are illustrative planning weights, not predictions.
import { addDays, fmtMonth } from "./plan";
import type { Policy } from "./policy";
import type { Decision, RunResult } from "./types";

export interface CallItem {
  key: string;
  id: string;
  why: string;
  action: string;
  owner: string;
  valueLakh: number;
  daysLeft: number | null;
  priority: number;
}

export interface Tower {
  funnel: { label: string; n: number }[];
  openings: { month: string; expected: number; ids: string[] }[];
  calls: CallItem[];
  gap: { territory: string; open: number; candidates: string[]; action: string }[];
  capacity: { committedLakh: number; trainingSeats: { language: string; week: number; seats: number }[]; fieldVisits: number; waves: { month: string; ids: string[] }[] };
  probabilities: Record<string, number>;
}

export function openingProbability(d: Decision): number {
  let p = 0;
  if (d.status === "APPROVED") p = 0.85;
  else if (d.status === "CONDITIONAL") p = d.allocatedPin ? 0.65 : 0.45;
  else return 0;
  if (d.codes.includes("CLAIM_UNVERIFIED")) p -= 0.1;
  if (d.codes.includes("TARGET_INFEASIBLE")) p -= 0.05;
  if (d.codes.includes("COMPLIANCE_CUE") || d.codes.includes("CAPACITY_OUTLIER")) p -= 0.1;
  return Math.max(0.1, Math.round(p * 100) / 100);
}

export function controlTower(r: RunResult, policy: Policy, today: string): Tower {
  const ds = r.decisions;
  const count = (s: string) => ds.filter((d) => d.status === s).length;
  const funnel = [
    { label: "Applications", n: ds.length },
    { label: "Usable slots", n: r.territories.reduce((n, t) => n + t.effectiveCapacity, 0) },
    { label: "Moving forward", n: count("APPROVED") + count("CONDITIONAL") },
    { label: "Approved", n: count("APPROVED") },
  ];
  const probabilities: Record<string, number> = {};
  const byMonth = new Map<string, { expected: number; ids: string[] }>();
  for (const d of ds) {
    const p = openingProbability(d);
    if (!p || !d.plan) continue;
    probabilities[d.key] = p;
    const m = fmtMonth(d.plan.readyDate);
    const cur = byMonth.get(m) ?? { expected: 0, ids: [] };
    cur.expected += p;
    cur.ids.push(d.id);
    byMonth.set(m, cur);
  }
  const openings = [...byMonth.entries()].map(([month, v]) => ({ month, expected: Math.round(v.expected * 10) / 10, ids: v.ids })).sort((a, b) => new Date("1 " + a.month).getTime() - new Date("1 " + b.month).getTime());

  // Who to call first: value at risk (estimate x chance of slipping) and time pressure.
  const calls: CallItem[] = [];
  for (const d of ds) {
    const value = d.capex?.required ?? 0;
    if (d.status === "CONDITIONAL") {
      const daysLeft = policy.windows.conditionalDays;
      calls.push({ key: d.key, id: d.id, why: d.why, action: d.nextStep, owner: d.owner, valueLakh: value, daysLeft, priority: value * (1 - openingProbability(d)) + 40 / daysLeft });
    } else if (d.status === "ON_HOLD") {
      const wins = d.rank && d.rank.k <= (r.territories.find((t) => t.key === d.territoryKey)?.effectiveCapacity ?? 0);
      calls.push({ key: d.key, id: d.id, why: d.why, action: d.nextStep, owner: d.owner, valueLakh: value, daysLeft: policy.windows.holdCloseDays, priority: (wins ? value : value * 0.3) + 40 / policy.windows.holdCloseDays });
    } else if (d.status === "WAITLISTED" && d.contested) {
      calls.push({ key: d.key, id: d.id, why: d.why, action: d.nextStep, owner: "Expansion", valueLakh: value, daysLeft: null, priority: value + 50 });
    } else if (d.status === "APPROVED" && d.codes.includes("CLAIM_UNVERIFIED")) {
      calls.push({ key: d.key, id: d.id, why: d.why, action: d.nextStep, owner: d.owner, valueLakh: value, daysLeft: 7, priority: value * 0.5 + 10 });
    }
  }
  calls.sort((a, b) => b.priority - a.priority);

  const gap = r.territories
    .filter((t) => t.unusedCapacity > 0 || t.effectiveCapacity < t.slots)
    .map((t) => ({
      territory: t.id,
      open: t.unusedCapacity,
      candidates: t.onHold,
      action:
        t.unusedCapacity > 0
          ? t.onHold.length
            ? `Chase ${t.onHold.slice(0, 3).join(", ")}: fixing a hold could fill ${t.unusedCapacity} open slot${t.unusedCapacity === 1 ? "" : "s"}`
            : `Source new applicants in ${t.city}: ${t.unusedCapacity} usable slot${t.unusedCapacity === 1 ? "" : "s"} unfilled`
          : `${t.slots - t.effectiveCapacity} wanted slot${t.slots - t.effectiveCapacity === 1 ? "" : "s"} blocked by lack of free pins: review the pin list`,
    }));

  const moving = ds.filter((d) => d.plan);
  const committedLakh = Math.round(moving.reduce((n, d) => n + (d.capex?.required ?? 0), 0) * 10) / 10;
  const seats = new Map<string, number>();
  for (const d of moving) {
    const s = d.plan!.steps.find((x) => x.owner === "Training");
    if (!s) continue;
    const k = `${d.plan!.training.language}|${s.week}`;
    seats.set(k, (seats.get(k) ?? 0) + 1);
  }
  const trainingSeats = [...seats.entries()].map(([k, n]) => ({ language: k.split("|")[0], week: Number(k.split("|")[1]), seats: n })).sort((a, b) => a.week - b.week || a.language.localeCompare(b.language));
  const fieldVisits = ds.filter((d) => d.status === "CONDITIONAL" || d.codes.includes("CLAIM_UNVERIFIED") || d.flags.some((f) => f.owner === "Field")).length;
  const waves = openings.map((o) => ({ month: o.month, ids: o.ids }));
  void addDays;
  void today;
  return { funnel, openings, calls: calls.slice(0, 8), gap, capacity: { committedLakh, trainingSeats, fieldVisits, waves }, probabilities };
}
