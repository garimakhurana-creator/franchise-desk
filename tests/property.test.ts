import { describe, expect, it } from "vitest";
import { run, DEFAULT_POLICY, type Dataset, type RunResult } from "@/lib/engine";
import { newSession, replay } from "@/lib/engine/session";
import { randomDataset, rng } from "./gen";
import { TODAY } from "./helpers";

const SEEDS = Array.from({ length: 60 }, (_, i) => 1000 + i * 7);
const go = (ds: Dataset, pinned: Record<string, string> = {}) => run(ds, DEFAULT_POLICY, { today: TODAY, pinned });

function invariants(ds: Dataset, r: RunResult) {
  const moving = r.decisions.filter((d) => d.status === "APPROVED" || d.status === "CONDITIONAL");
  const pins = moving.filter((d) => d.allocatedPin).map((d) => d.allocatedPin!);
  expect(new Set(pins).size, "no two allocations share a pin").toBe(pins.length);
  const storePins = new Set(ds.stores.map((s) => s.pin));
  for (const p of pins) expect(storePins.has(p), `no allocation on store pin ${p}`).toBe(false);
  for (const t of r.territories) expect(t.approved.length + t.conditional.length).toBeLessThanOrEqual(t.effectiveCapacity);
  for (const d of r.decisions) if (d.status === "ON_HOLD") expect(d.allocatedPin).toBeNull();
  expect(r.pinConflicts).toBe(0);
}

describe("property tests over random datasets", () => {
  it.each(SEEDS)("seed %i: pin rule, capacity, holds, determinism", (seed) => {
    const ds = randomDataset(seed);
    const r = go(ds);
    invariants(ds, r);
    expect(JSON.stringify(go(ds))).toBe(JSON.stringify(r));
  });

  it.each(SEEDS.slice(0, 20))("seed %i: row order and ID case do not change decisions", (seed) => {
    const ds = randomDataset(seed);
    const r0 = go(ds);
    const shuffle = rng(seed);
    const apps = [...ds.applications].sort(() => shuffle() - 0.5).map((a) => ({ ...a, id: a.id.toLowerCase() }));
    const r1 = go({ ...ds, applications: apps, territories: [...ds.territories].reverse() });
    for (const d of r0.decisions) {
      const e = r1.decisions.find((x) => x.key === d.key)!;
      expect(e.status).toBe(d.status);
      expect(e.score?.total).toBe(d.score?.total);
    }
  });

  it.each(SEEDS.slice(0, 20))("seed %i: names and language never change scores", (seed) => {
    const ds = randomDataset(seed);
    const r0 = go(ds);
    const langs = ["Hindi", "English", "Kannada"] as const;
    const swapped = { ...ds, applications: ds.applications.map((a, i) => ({ ...a, name: `Person ${i}`, language: langs[i % 3] })) };
    const r1 = go(swapped);
    for (const d of r0.decisions) expect(r1.decisions.find((x) => x.key === d.key)!.score?.total).toBe(d.score?.total);
  });

  it.each(SEEDS.slice(0, 20))("seed %i: pinned approvals survive later updates unless a swap is confirmed", (seed) => {
    const ds = randomDataset(seed);
    const s = newSession(ds, DEFAULT_POLICY, TODAY);
    const first = go(ds);
    const approved = first.decisions.filter((d) => d.status === "APPROVED").map((d) => d.key);
    for (const d of first.decisions.filter((x) => x.status !== "APPROVED").slice(0, 6)) {
      s.log.push({ at: "t", update: { kind: "facts", key: d.key, changes: { invest: 70, experience: 9, space: "Owned", size: 600, floor: "Ground" }, text: "boost" } });
    }
    const last = replay(s).at(-1)!.result;
    for (const k of approved) expect(last.decisions.find((d) => d.key === k)!.status).toBe("APPROVED");
    invariants(ds, last);
  });
});
