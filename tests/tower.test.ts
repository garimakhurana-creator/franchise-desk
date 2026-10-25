import { describe, expect, it } from "vitest";
import { run, DEFAULT_POLICY } from "@/lib/engine";
import { selfTest } from "@/lib/engine/selftest";
import { controlTower } from "@/lib/engine/tower";
import { loadXlsx, TODAY } from "./helpers";

const ds = loadXlsx("golden/golden.xlsx");

describe("integrity self-test", () => {
  it("passes every check on the golden file", () => {
    const checks = selfTest(ds, DEFAULT_POLICY, { today: TODAY, pinned: {} });
    expect(checks).toHaveLength(5);
    for (const c of checks) expect(c.pass, `${c.name}: ${c.detail}`).toBe(true);
  });
  it("passes on the red-team file too", () => {
    const rt = loadXlsx("redteam/redteam.xlsx", "upload");
    for (const c of selfTest(rt, DEFAULT_POLICY, { today: TODAY, pinned: {} })) expect(c.pass, `${c.name}: ${c.detail}`).toBe(true);
  });
});

describe("control tower", () => {
  const r = run(ds, DEFAULT_POLICY, { today: TODAY, pinned: {} });
  const t = controlTower(r, DEFAULT_POLICY, TODAY);
  it("funnel and openings reflect the decisions", () => {
    expect(t.funnel[0].n).toBe(22);
    expect(t.funnel.find((f) => f.label === "Approved")!.n).toBe(5);
    const ids = t.openings.flatMap((o) => o.ids);
    expect(ids).toEqual(expect.arrayContaining(["APP-001", "APP-010", "APP-018"]));
  });
  it("call-first list leads with live windows, not settled approvals", () => {
    expect(t.calls.length).toBeGreaterThan(0);
    for (const c of t.calls) expect(r.decisions.find((d) => d.key === c.key)!.status).not.toBe("DECLINED");
  });
  it("capacity plan sums partner capital", () => {
    expect(t.capacity.committedLakh).toBeGreaterThan(100);
  });
});
