"use client";

import type { Dataset, RunResult, Status } from "@/lib/engine/types";
import { Icon, StatusGlyph, STATUS_LABEL, STATUS_VAR } from "./icons";

const ORDER: Status[] = ["APPROVED", "CONDITIONAL", "WAITLISTED", "ON_HOLD", "DECLINED", "WITHDRAWN"];

/** The decision ledger: one proportional bar instead of a grid of identical cards. Segments filter the table. */
export function SummaryStrip({ dataset, result, statusFilter, onStatus, onNotes }: { dataset: Dataset; result: RunResult; statusFilter: Status[]; onStatus: (s: Status[]) => void; onNotes: () => void }) {
  const total = result.decisions.length || 1;
  const counts = Object.fromEntries(ORDER.map((s) => [s, result.decisions.filter((d) => d.status === s).length])) as Record<Status, number>;
  const cap = result.territories.reduce((n, t) => n + t.effectiveCapacity, 0);
  const used = result.territories.reduce((n, t) => n + t.approved.length + t.conditional.length, 0);
  const wanted = result.territories.reduce((n, t) => n + t.slots, 0);
  const warnings = dataset.notes.filter((n) => n.severity !== "info").length;
  const toggle = (s: Status) => onStatus(statusFilter.includes(s) ? statusFilter.filter((x) => x !== s) : [...statusFilter, s]);
  const shown = ORDER.filter((s) => counts[s] > 0);

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
          Read <span className="num font-medium text-ink-2">{dataset.applications.length}</span> applications and <span className="num font-medium text-ink-2">{dataset.territories.length}</span> territories
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

      <div className="mt-3 rounded-[var(--radius-l)] border border-line bg-surface px-4 pt-3.5 pb-3" style={{ boxShadow: "var(--shadow)" }}>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <h2 className="serif text-[22px] leading-tight">
            <span className="num">{counts.APPROVED + counts.CONDITIONAL}</span> of <span className="num">{result.decisions.length}</span> move forward
          </h2>
          <span className="text-[13px] text-ink-2">
            <span className="num font-semibold text-ink">{used}</span> of <span className="num">{cap}</span> usable slots filled
            {wanted > cap && (
              <span className="text-muted">
                {" "}
                · <span className="num">{wanted - cap}</span> wanted slot{wanted - cap === 1 ? "" : "s"} blocked by pins that already have our stores
              </span>
            )}
          </span>
          <span
            className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-medium"
            style={{ color: result.pinConflicts ? "var(--declined)" : "var(--approved)", background: `color-mix(in srgb, ${result.pinConflicts ? "var(--declined)" : "var(--approved)"} 12%, transparent)` }}
            title="No two approved or conditional partners share a pin code, and none sits on an existing store's pin."
          >
            <Icon.Shield size={15} /> Pin rule verified: <span className="num">{result.pinConflicts}</span> conflicts
          </span>
        </div>

        {/* proportional ledger bar */}
        <div className="mt-3 flex h-3.5 w-full gap-[3px]" role="group" aria-label="Decisions by status; click a segment to filter the table">
          {shown.map((s) => {
            const on = statusFilter.includes(s);
            const dim = statusFilter.length > 0 && !on;
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggle(s)}
                aria-pressed={on}
                aria-label={`${STATUS_LABEL[s]}: ${counts[s]}`}
                title={`${STATUS_LABEL[s]}: ${counts[s]}`}
                className={`h-full rounded-[3px] transition-opacity ${s === "CONDITIONAL" ? "hatch" : ""}`}
                style={{
                  flexGrow: counts[s],
                  flexBasis: 0,
                  minWidth: 10,
                  color: STATUS_VAR[s],
                  background: s === "CONDITIONAL" ? `color-mix(in srgb, ${STATUS_VAR[s]} 22%, transparent)` : STATUS_VAR[s],
                  boxShadow: s === "CONDITIONAL" ? `inset 0 0 0 1.5px ${STATUS_VAR[s]}` : undefined,
                  opacity: dim ? 0.28 : 1,
                }}
              />
            );
          })}
        </div>
        <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px]">
          {ORDER.filter((s) => counts[s] > 0 || s !== "WITHDRAWN").map((s) => {
            const on = statusFilter.includes(s);
            return (
              <li key={s}>
                <button type="button" onClick={() => toggle(s)} aria-pressed={on} className={`inline-flex items-center gap-1.5 rounded-full px-1.5 py-0.5 ${on ? "bg-surface-3" : "hover:bg-surface-2"}`}>
                  <StatusGlyph status={s} size={13} />
                  <span className="text-ink-2">{STATUS_LABEL[s]}</span>
                  <span className="num font-semibold">{counts[s]}</span>
                  <span className="num text-[11.5px] text-muted">{Math.round((counts[s] / total) * 100)}%</span>
                </button>
              </li>
            );
          })}
          {statusFilter.length > 0 && (
            <li>
              <button type="button" onClick={() => onStatus([])} className="text-[12.5px] text-muted underline decoration-dotted underline-offset-2 hover:text-ink">
                Show all
              </button>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
