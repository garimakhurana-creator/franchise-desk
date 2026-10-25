// Dev helper: print decisions for a workbook. Usage: npx tsx scripts/show.ts tests/golden/golden.xlsx
import { readFileSync } from "node:fs";
import { readWorkbook } from "../lib/parse/xlsx";
import { parseWorkbook } from "../lib/parse/parse";
import { run, DEFAULT_POLICY } from "../lib/engine";

const file = process.argv[2] ?? "tests/golden/golden.xlsx";
const ds = parseWorkbook(readWorkbook(new Uint8Array(readFileSync(file))), file);
const r = run(ds, DEFAULT_POLICY, { today: "2026-10-25", pinned: {} });
for (const d of r.decisions) {
  console.log(`${d.id.padEnd(8)} ${d.status.padEnd(11)} ${String(d.score?.total ?? "-").padStart(3)} [${d.codes.join(",")}]`);
  console.log(`   ${d.why}  (${d.why.split(/\s+/).length}w)`);
  console.log(`   next: ${d.nextStep} [${d.owner}]`);
  if (process.argv.includes("-v")) for (const x of d.detail) console.log(`     · ${x}`);
}
console.log("runId", r.runId, "conflicts", r.pinConflicts);
for (const t of r.territories) console.log(t.id, "cap", t.effectiveCapacity, "A", t.approved, "C", t.conditional, "W", t.waitlisted, t.bindingReason ?? "");
