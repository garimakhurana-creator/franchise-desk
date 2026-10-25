// Excel export with formula-injection sanitising. Runs in the browser.
import * as XLSX from "xlsx";
import { CODE_LABEL } from "./engine/codes";
import { statusWord } from "./engine/counterfactual";
import type { LogEntry } from "./engine/session";
import type { Dataset, RunResult } from "./engine/types";

/** Prefix cells that a spreadsheet would treat as a formula. */
export function sanitiseCell(v: unknown): unknown {
  if (typeof v !== "string") return v;
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

const clean = (rows: unknown[][]) => rows.map((r) => r.map(sanitiseCell));

export function buildExport(ds: Dataset, r: RunResult, log: LogEntry[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const banner = ds.source === "sample" ? [["SAMPLE DATA, not real applicants"]] : [[`Source: ${ds.fileName}`]];
  const meta = [[`Run ${r.runId} · policy ${r.policyVersion} · as of ${r.asOf}`], []];

  const decisions = [
    ["Application ID", "Applicant", "Territory", "Pin", "Status", "Why", "Next step", "Owner", "Score", "Rank", "Queue", "Reasons"],
    ...r.decisions.map((d) => [d.id, d.name, d.territoryId ?? "", d.pin ?? "", statusWord(d.status), d.why, d.nextStep, d.owner, d.score?.total ?? "", d.rank ? `${d.rank.k} of ${d.rank.n}` : "", d.queuePos ?? "", d.codes.map((c) => CODE_LABEL[c]).join("; ")]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(clean([...banner, ...meta, ...decisions])), "Decisions");

  const plans: unknown[][] = [["Application ID", "Week", "Weeks", "Step", "Owner", "Ready by", "Target", "Training", "Buddy store", "Hub", "Payback (months, illustrative)"]];
  for (const d of r.decisions)
    if (d.plan)
      for (const s of d.plan.steps)
        plans.push([d.id, s.week, s.weeks, s.label, s.owner, d.plan.readyDate, d.plan.targetDate ?? "", `${d.plan.training.track} ${d.plan.training.weeks} wk, ${d.plan.training.language}`, d.plan.training.buddyStore ?? "", d.plan.supply.hub, d.plan.payback.months ?? "n/a"]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(clean([...banner, ...meta, ...plans])), "Plans");

  const ters = [
    ["Territory", "City", "Tier", "Priority", "Open slots", "Free pins", "Usable capacity", "Approved", "Conditional", "Waitlisted", "On hold", "Note"],
    ...r.territories.map((t) => [t.id, t.city ?? "", t.tier ?? "", t.priority ?? "", t.slots, t.freePins.join(", "), t.effectiveCapacity, t.approved.join(", "), t.conditional.join(", "), t.waitlisted.join(", "), t.onHold.join(", "), t.bindingReason ?? ""]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(clean([...banner, ...meta, ...ters])), "Territory summary");

  const notes = [["Sheet", "Row", "Note"], ...ds.notes.map((n) => [n.sheet, n.row ?? "", n.message]), ...ds.rowsIgnored.map((i) => [i.sheet, i.row, `Ignored: ${i.reason}`])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(clean([...banner, ...notes])), "Data notes");

  const audit = [["When", "Update"], ...log.map((l) => [l.at, l.update.text])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(clean([...banner, ...audit])), "Audit log");
  return wb;
}

export function downloadExport(ds: Dataset, r: RunResult, log: LogEntry[]) {
  const wb = buildExport(ds, r, log);
  XLSX.writeFile(wb, `franchise-decisions-${r.runId}.xlsx`, { compression: true });
}
