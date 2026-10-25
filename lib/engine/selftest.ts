// Integrity self-test, run live in the browser: determinism, order independence, fairness, pin rule.
import { run } from "./decide";
import type { Policy } from "./policy";
import type { Dataset, RunContext, RunResult } from "./types";

export interface Check {
  name: string;
  pass: boolean;
  detail: string;
  ms: number;
}

function timed(name: string, f: () => { pass: boolean; detail: string }): Check {
  const t = performance.now();
  try {
    const r = f();
    return { name, ...r, ms: Math.round(performance.now() - t) };
  } catch (e) {
    return { name, pass: false, detail: `error: ${(e as Error).message}`, ms: Math.round(performance.now() - t) };
  }
}

export function selfTest(ds: Dataset, policy: Policy, ctx: RunContext): Check[] {
  const base: RunResult = run(ds, policy, ctx);
  const statusOf = (r: RunResult) => Object.fromEntries(r.decisions.map((d) => [d.key, d.status]));
  const diffCount = (a: Record<string, string>, b: Record<string, string>) => Object.keys(a).filter((k) => a[k] !== b[k]).length;
  return [
    timed("Determinism: same input twice gives identical output", () => {
      const again = run(ds, policy, ctx);
      const same = JSON.stringify(again) === JSON.stringify(base);
      return { pass: same, detail: same ? `run ${base.runId} reproduced exactly` : "outputs differ" };
    }),
    timed("Row order and ID case: shuffled rows, lower-case IDs", () => {
      const apps = [...ds.applications].reverse();
      const rot = apps.length ? [...apps.slice(apps.length >> 1), ...apps.slice(0, apps.length >> 1)] : apps;
      const shuffled = { ...ds, applications: rot.map((a) => ({ ...a, id: a.id.toLowerCase() })), territories: [...ds.territories].reverse() };
      const r = run(shuffled, policy, ctx);
      const n = diffCount(statusOf(base), statusOf(r));
      return { pass: n === 0, detail: n === 0 ? `${ds.applications.length} decisions unchanged` : `${n} decisions changed` };
    }),
    timed("Fairness: names and languages swapped between applicants", () => {
      const names = ds.applications.map((a) => a.name).reverse();
      const langs = ds.applications.map((a) => a.language).reverse();
      const swapped = { ...ds, applications: ds.applications.map((a, i) => ({ ...a, name: names[i], language: langs[i] })) };
      const r = run(swapped, policy, ctx);
      const changed = base.decisions.filter((d) => r.decisions.find((x) => x.key === d.key)?.score?.total !== d.score?.total);
      return { pass: changed.length === 0, detail: changed.length === 0 ? "every score identical" : `${changed.length} scores changed: ${changed.slice(0, 3).map((d) => d.id).join(", ")}` };
    }),
    timed("Pin rule: one store per pin, none on an existing store's pin", () => {
      const over = base.territories.filter((t) => t.approved.length + t.conditional.length > t.effectiveCapacity);
      return { pass: base.pinConflicts === 0 && over.length === 0, detail: `${base.pinConflicts} pin conflicts; ${over.length} territories over usable capacity` };
    }),
    timed("Holds use no slot", () => {
      const bad = base.decisions.filter((d) => d.status === "ON_HOLD" && d.allocatedPin);
      return { pass: bad.length === 0, detail: `${base.decisions.filter((d) => d.status === "ON_HOLD").length} holds, ${bad.length} holding a slot` };
    }),
  ];
}
