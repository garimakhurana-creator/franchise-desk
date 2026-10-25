// "Held in N% of variations": re-run with the main thresholds nudged ±10% and count how often
// a decision keeps its status. Computed on demand for one card.
import { run } from "./decide";
import { setPolicyValue, getPolicyValue, type Policy } from "./policy";
import type { Dataset, RunContext, Status } from "./types";

const NUDGE_PATHS = ["bars.approval", "bars.decline", "capex.declineBelowPct", "capex.bufferPct", "capex.fitoutPerSqft.1", "capex.fitoutPerSqft.2", "capex.fitoutPerSqft.3", "spacing.km"];

export function heldPercent(ds: Dataset, policy: Policy, ctx: RunContext, key: string, status: Status): { pct: number; variants: number } {
  const pct = policy.stability.nudgePct / 100;
  let held = 0;
  let n = 0;
  for (const path of NUDGE_PATHS) {
    const v = Number(getPolicyValue(policy, path));
    if (!Number.isFinite(v)) continue;
    for (const f of [1 - pct, 1 + pct]) {
      const p = setPolicyValue(policy, path, Math.round(v * f * 100) / 100);
      const d = run(ds, p, ctx).decisions.find((x) => x.key === key);
      n++;
      if (d?.status === status) held++;
    }
  }
  return { pct: n ? Math.round((held / n) * 100) : 100, variants: n };
}
