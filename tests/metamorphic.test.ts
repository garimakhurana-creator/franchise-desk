import { describe, expect, it } from "vitest";
import { run, DEFAULT_POLICY, type Dataset, type Decision } from "@/lib/engine";
import { statusOrder } from "@/lib/engine/session";
import { randomDataset } from "./gen";
import { loadXlsx, TODAY } from "./helpers";
import reference from "@/lib/engine/reference.json";

const go = (ds: Dataset) => run(ds, DEFAULT_POLICY, { today: TODAY, pinned: {} });
const get = (ds: Decision[], k: string) => ds.find((d) => d.key === k)!;
const DATASETS: [string, Dataset][] = [["golden", loadXlsx("golden/golden.xlsx")], ...[11, 23, 37, 41, 59].map((s) => [`random-${s}`, randomDataset(s, 30)] as [string, Dataset])];
const notWorse = (a: Decision, b: Decision) => statusOrder(b.status) >= statusOrder(a.status);

describe.each(DATASETS)("metamorphic on %s", (_name, ds) => {
  const base = go(ds);

  it("raising investment (within lakh range) never worsens status or score", () => {
    for (const a of ds.applications) {
      if (a.invest === null || a.invest >= 4000) continue;
      const r = go({ ...ds, applications: ds.applications.map((x) => (x.key === a.key ? { ...x, invest: a.invest! + 5 } : x)) });
      const before = get(base.decisions, a.key);
      const after = get(r.decisions, a.key);
      expect(notWorse(before, after), `${a.id}: ${before.status} -> ${after.status}`).toBe(true);
      if (before.score && after.score) expect(after.score.total).toBeGreaterThanOrEqual(before.score.total);
    }
  });

  it("making a site ready (adding missing size and floor) never worsens it", () => {
    for (const a of ds.applications) {
      if (!(a.space === "Owned" || a.space === "Rented") || (a.size && a.floor && a.floor !== "Unknown")) continue;
      // a valid space: the tier's ideal size (a bigger space genuinely costs more)
      const tier = reference.cities.find((c) => c.prefix === (a.pin ?? "").slice(0, 3))?.tier ?? 2;
      const ideal = DEFAULT_POLICY.capex.idealSize[String(tier) as "1"];
      // Skip funds-limited applicants: revealing the size can correctly turn "unknown" into a funding decline.
      const need = base.decisions.find((d) => d.key === a.key)?.capex?.required ?? 0;
      if (a.invest === null || a.invest < need) continue;
      const r = go({ ...ds, applications: ds.applications.map((x) => (x.key === a.key ? { ...x, size: x.size ?? ideal, floor: "Ground" as const } : x)) });
      const before = get(base.decisions, a.key);
      const after = get(r.decisions, a.key);
      expect(notWorse(before, after), `${a.id}: ${before.status} -> ${after.status}`).toBe(true);
    }
  });

  // The competitor has a distinct property; an exact clone of someone's site correctly triggers a same-property hold.
  it("adding a stronger competitor never improves anyone else", () => {
    for (const t of ds.territories.slice(0, 4)) {
      const pin = t.pins[0];
      if (!pin) continue;
      const strong = { ...ds.applications[0], key: "APP-9999", id: "APP-9999", name: "New Strong", city: t.city, pin, invest: 80, experience: 10, space: "Owned" as const, size: 777, floor: "Ground" as const, notes: "", targetMonths: 6, provenance: {}, withdrawn: false };
      const r = go({ ...ds, applications: [...ds.applications, strong] });
      for (const d of base.decisions) {
        const after = get(r.decisions, d.key);
        expect(statusOrder(after.status) <= statusOrder(d.status), `${d.id}: ${d.status} -> ${after.status}`).toBe(true);
      }
    }
  });

  it("removing an applicant never worsens another (spacing aside)", () => {
    for (const a of ds.applications.slice(0, 15)) {
      const r = go({ ...ds, applications: ds.applications.filter((x) => x.key !== a.key) });
      for (const d of r.decisions) {
        const before = get(base.decisions, d.key);
        if (before.codes.includes("ADJACENCY") || d.codes.includes("ADJACENCY")) continue;
        expect(notWorse(before, d), `removing ${a.id}: ${d.id} ${before.status} -> ${d.status}`).toBe(true);
      }
    }
  });

  it("adding a slot or a free pin never worsens anyone", () => {
    for (const t of ds.territories) {
      const more = go({ ...ds, territories: ds.territories.map((x) => (x.key === t.key ? { ...x, slots: (x.slots ?? 0) + 1 } : x)) });
      const pin = `${t.pins[0]?.slice(0, 3) ?? "560"}999`;
      const morePin = go({ ...ds, territories: ds.territories.map((x) => (x.key === t.key ? { ...x, pins: [...x.pins, pin] } : x)) });
      for (const d of base.decisions) {
        expect(notWorse(d, get(more.decisions, d.key)), `slot+ ${t.id}: ${d.id}`).toBe(true);
        expect(notWorse(d, get(morePin.decisions, d.key)), `pin+ ${t.id}: ${d.id}`).toBe(true);
      }
    }
  });

  it("an existing store's pin never yields an allocation", () => {
    const storePins = new Set(ds.stores.map((s) => s.pin));
    for (const d of base.decisions) if (d.allocatedPin) expect(storePins.has(d.allocatedPin)).toBe(false);
  });

  it("renaming or changing language changes no score", () => {
    const r = go({ ...ds, applications: ds.applications.map((a) => ({ ...a, name: "Renamed " + a.key, language: "Hindi" as const })) });
    for (const d of base.decisions) expect(get(r.decisions, d.key).score?.total).toBe(d.score?.total);
  });
});
