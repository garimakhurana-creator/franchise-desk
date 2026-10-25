import { describe, expect, it } from "vitest";
import { run, DEFAULT_POLICY } from "@/lib/engine";
import { lintAll } from "@/lib/engine/lint";
import { newSession, replay } from "@/lib/engine/session";
import { loadXlsx, TODAY } from "./helpers";
import { randomDataset } from "./gen";

const sets = [
  ["golden", loadXlsx("golden/golden.xlsx")],
  ["stress500", loadXlsx("golden/stress500.xlsx")],
  ...[3, 17, 29, 44, 71, 88].map((s) => [`random-${s}`, randomDataset(s, 60)] as const),
] as const;

describe("explanation lint", () => {
  it.each(sets)("%s: every explanation passes the style rules", (_n, ds) => {
    const r = run(ds, DEFAULT_POLICY, { today: TODAY, pinned: {} });
    const issues = lintAll(r.decisions);
    expect(issues.slice(0, 8)).toEqual([]);
  });

  it("explanations after follow-up updates also pass", () => {
    const ds = loadXlsx("golden/golden.xlsx");
    const s = newSession(ds, DEFAULT_POLICY, TODAY);
    s.log.push({ at: "t", update: { kind: "facts", key: "APP-4", changes: { pin: "570008" }, text: "" } });
    s.log.push({ at: "t", update: { kind: "withdraw", key: "APP-1", text: "" } });
    s.log.push({ at: "t", update: { kind: "facts", key: "APP-7", changes: { size: 480, floor: "Ground" }, text: "" } });
    s.log.push({ at: "t", update: { kind: "swap", challenger: "APP-4", displaced: "APP-3", text: "" } });
    s.log.push({ at: "t", update: { kind: "days", days: 30, text: "" } });
    for (const step of replay(s)) expect(lintAll(step.result.decisions).slice(0, 8)).toEqual([]);
  });
});
