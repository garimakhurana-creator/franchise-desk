"use client";

import type { Dataset, RunResult, Status } from "@/lib/engine/types";
import { Icon, STATUS_LABEL, STATUS_VAR } from "../icons";

const ORDER: Status[] = ["APPROVED", "CONDITIONAL", "WAITLISTED", "ON_HOLD", "DECLINED"];

/** Slim KPI strip above the map: the run at a glance. Status counts filter the list. */
export function HudStats({ result, dataset, statusFilter, onStatus, onNotes }: { result: RunResult; dataset: Dataset; statusFilter: Status[]; onStatus: (s: Status[]) => void; onNotes: () => void }) {
  const count = (s: Status) => result.decisions.filter((d) => d.status === s).length;
  const cap = result.territories.reduce((n, t) => n + t.effectiveCapacity, 0);
  const used = result.territories.reduce((n, t) => n + t.approved.length + t.conditional.length, 0);
  const moving = count("APPROVED") + count("CONDITIONAL");
  const issues = dataset.notes.filter((n) => n.severity !== "info").length;
  const toggle = (s: Status) => onStatus(statusFilter.includes(s) ? statusFilter.filter((x) => x !== s) : [...statusFilter, s]);
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line bg-[#0a0a10] px-4 py-2.5">
      <div className="leading-tight">
        <div className="text-[12px] text-muted">Moving forward</div>
        <div className="text-[18px] font-semibold">
          <span className="num">{moving}</span>
          <span className="num text-[13px] font-normal text-muted"> of {result.decisions.length}</span>
        </div>
      </div>
      <span className="hidden h-8 w-px bg-line sm:block" aria-hidden />
      {ORDER.map((s) => {
        const on = statusFilter.includes(s);
        return (
          <button key={s} type="button" onClick={() => toggle(s)} aria-pressed={on} className={`rounded-md px-1.5 py-0.5 text-left leading-tight transition-colors ${on ? "bg-surface-2" : "hover:bg-surface"}`} title={`Show only ${STATUS_LABEL[s].toLowerCase()}`}>
            <div className="flex items-center gap-1.5 text-[12px] text-muted">
              <i className="inline-block size-1.5 rounded-full" style={{ background: STATUS_VAR[s] }} />
              {STATUS_LABEL[s]}
            </div>
            <div className="num text-[18px] font-semibold" style={{ color: on ? STATUS_VAR[s] : undefined }}>
              {count(s)}
            </div>
          </button>
        );
      })}
      <span className="hidden h-8 w-px bg-line sm:block" aria-hidden />
      <div className="leading-tight" title="Usable slots = the smaller of open slots and free pins in each territory">
        <div className="text-[12px] text-muted">Slots filled</div>
        <div className="text-[18px] font-semibold">
          <span className="num">{used}</span>
          <span className="num text-[13px] font-normal text-muted"> / {cap}</span>
        </div>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-3 text-[12px]">
        <button type="button" onClick={onNotes} className="text-muted underline decoration-dotted underline-offset-2 hover:text-ink">
          {dataset.applications.length} read · {dataset.rowsIgnored.length} ignored · {issues} issue{issues === 1 ? "" : "s"}
        </button>
        {dataset.source === "sample" && <span className="rounded px-1.5 py-0.5 font-semibold" style={{ background: "var(--neon-soft)", color: "var(--neon)" }}>Sample data</span>}
        <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: result.pinConflicts ? "var(--declined)" : "var(--approved)" }} title="No two approved or conditional partners share a pin code, and none sits on an existing store's pin.">
          <Icon.Shield size={15} /> Pin rule verified: <span className="num">{result.pinConflicts}</span> conflicts
        </span>
      </div>
    </div>
  );
}
