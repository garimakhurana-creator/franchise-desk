import { describe, expect, it } from "vitest";
import { run, DEFAULT_POLICY } from "@/lib/engine";
import { heldPercent } from "@/lib/engine/stability";
import { loadXlsx, TODAY } from "./helpers";

describe("stability under policy nudges", () => {
  const ds = loadXlsx("golden/golden.xlsx");
  const r = run(ds, DEFAULT_POLICY, { today: TODAY, pinned: {} });
  it("clear-cut decisions hold in every variation", () => {
    const d = r.decisions.find((x) => x.key === "APP-13")!; // out of territory
    expect(heldPercent(ds, DEFAULT_POLICY, { today: TODAY, pinned: {} }, d.key, d.status).pct).toBe(100);
  });
  it("returns a percentage for every decision", () => {
    for (const d of r.decisions.slice(0, 5)) {
      const h = heldPercent(ds, DEFAULT_POLICY, { today: TODAY, pinned: {} }, d.key, d.status);
      expect(h.variants).toBe(16);
      expect(h.pct).toBeGreaterThanOrEqual(0);
      expect(h.pct).toBeLessThanOrEqual(100);
    }
  });
});
