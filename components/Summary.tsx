"use client";

import type { Dataset, RunResult, Status } from "@/lib/engine/types";
import { Icon, StatusGlyph, STATUS_LABEL, STATUS_VAR } from "./icons";

const ORDER: Status[] = ["APPROVED", "CONDITIONAL", "WAITLISTED", "ON_HOLD", "DECLINED", "WITHDRAWN"];

export function SummaryStrip({ dataset, result, statusFilter, onStatus, onNotes }: { dataset: Dataset; result: RunResult; statusFilter: Status[]; onStatus: (s: Status[]) => void; onNotes: () => void }) {
  const counts = Object.fromEntries(ORDER.map((s) => [s, result.decisions.filter((d) => d.status === s).length])) as Record<Status, number>;
  const cap = result.territories.reduce((n, t) => n + t.effectiveCapacity, 0);
  const used = result.territories.reduce((n, t) => n + t.approved.length + t.conditional.length, 0);
  const warnings = dataset.notes.filter((n) => n.severity !== "info").length;
  const toggle = (s: Status) => onStatus(statusFilter.includes(s) ? statusFilter.filter((x) => x !== s) : [...statusFilter, s]);
  return (
    <div className="pt-4">
      {/* Parse report: shown before the decisions */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
        {dataset.source === "sample" && (
          <span className="rounded px-1.5 py-0.5 font-semibold" style={{ background: "var(--gold-soft)", color: "var(--gold)" }}>
            SAMPLE DATA, not real applicants
          </span>
        )}
        <span>
          <span className="num font-medium text-ink-2">{dataset.applications.length}</span> applications and <span className="num font-medium text-ink-2">{dataset.territories.length}</span> territories read
        </span>
        <span aria-hidden>·</span>
        <span>
          <span className="num font-medium text-ink-2">{dataset.rowsIgnored.length}</span> row{dataset.rowsIgnored.length === 1 ? "" : "s"} ignored
        </span>
        <span aria-hidden>·</span>
        <button type="button" onClick={onNotes} className="underline decoration-dotted underline-offset-2 hover:text-ink">
          {warnings} data issue{warnings === 1 ? "" : "s"}, {dataset.notes.length - warnings} note{dataset.notes.length - warnings === 1 ? "" : "s"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-stretch gap-2">
        {ORDER.filter((s) => counts[s] > 0 || s !== "WITHDRAWN").map((s) => {
          const on = statusFilter.includes(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggle(s)}
              aria-pressed={on}
              className={`group flex min-w-[112px] flex-col rounded-[var(--radius-m)] border px-3 py-2 text-left transition-colors ${on ? "bg-surface-2" : "bg-surface hover:bg-surface-2"}`}
              style={{ borderColor: on ? STATUS_VAR[s] : "var(--line)" }}
            >
              <span className="flex items-center gap-1.5 text-[12px] text-ink-2">
                <StatusGlyph status={s} size={12} />
                {STATUS_LABEL[s]}
              </span>
              <span className="num mt-0.5 text-[24px] font-semibold leading-none" style={{ color: counts[s] ? "var(--ink)" : "var(--muted)" }}>
                {counts[s]}
              </span>
            </button>
          );
        })}
        <div className="flex min-w-[150px] flex-col justify-center rounded-[var(--radius-m)] border border-line bg-surface px-3 py-2">
          <span className="text-[12px] text-ink-2">Usable slots filled</span>
          <span className="num mt-0.5 text-[24px] font-semibold leading-none">
            {used}
            <span className="text-[15px] font-normal text-muted"> / {cap}</span>
          </span>
        </div>
        <div
          className="flex items-center gap-2 rounded-[var(--radius-m)] border px-3 py-2 text-[13px] font-medium"
          style={{ borderColor: result.pinConflicts ? "var(--declined)" : "color-mix(in srgb, var(--approved) 45%, transparent)", color: result.pinConflicts ? "var(--declined)" : "var(--approved)" }}
          title="No two approved or conditional partners share a pin code, and none sits on an existing store's pin."
        >
          <Icon.Shield size={18} />
          <span>
            Pin rule verified:
            <br />
            <span className="num">{result.pinConflicts}</span> conflicts
          </span>
        </div>
      </div>
    </div>
  );
}
