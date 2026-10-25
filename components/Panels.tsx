"use client";

import { useEffect, useRef, useState } from "react";
import { getPolicyValue, type Policy } from "@/lib/engine/policy";
import type { LogEntry } from "@/lib/engine/session";
import type { Dataset } from "@/lib/engine/types";
import { centroidSource } from "@/lib/engine/geo";
import { Icon } from "./icons";

export function Drawer({ open, title, onClose, children, wide }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="absolute inset-0 bg-black/30" aria-label="Close" onClick={onClose} />
      <div ref={ref} tabIndex={-1} className={`rise absolute inset-y-0 right-0 w-full ${wide ? "max-w-[1240px]" : "max-w-[560px]"} overflow-y-auto border-l border-line bg-surface focus:outline-none scrollbar-thin`} style={{ boxShadow: "var(--shadow)" }}>
        <div className="sticky top-0 z-10 flex items-center border-b border-line bg-surface px-5 py-3">
          <h2 className="text-[16px] font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="ml-auto grid size-8 place-items-center rounded-full hover:bg-surface-2" aria-label={`Close ${title}`}>
            <Icon.Close />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

const FIELDS: { path: string; label: string; unit?: string; step?: number }[] = [
  { path: "bars.approval", label: "Approval bar", unit: "score" },
  { path: "bars.decline", label: "Decline bar", unit: "score" },
  { path: "bars.priorityAdjust.High", label: "High-priority bar adjustment", unit: "points" },
  { path: "bars.priorityAdjust.Low", label: "Low-priority bar adjustment", unit: "points" },
  { path: "capex.declineBelowPct", label: "Decline when funds are below", unit: "% of estimate" },
  { path: "capex.bufferPct", label: "Working-capital buffer", unit: "%" },
  { path: "capex.fitoutPerSqft.1", label: "Fit-out, Tier 1", unit: "₹/sq ft" },
  { path: "capex.fitoutPerSqft.2", label: "Fit-out, Tier 2", unit: "₹/sq ft" },
  { path: "capex.fitoutPerSqft.3", label: "Fit-out, Tier 3", unit: "₹/sq ft" },
  { path: "capex.stockPerSqft.1", label: "Opening stock, Tier 1", unit: "₹/sq ft" },
  { path: "capex.stockPerSqft.2", label: "Opening stock, Tier 2", unit: "₹/sq ft" },
  { path: "capex.stockPerSqft.3", label: "Opening stock, Tier 3", unit: "₹/sq ft" },
  { path: "capex.rentPerSqftMonth.1", label: "Rent index, Tier 1", unit: "₹/sq ft/month" },
  { path: "capex.rentPerSqftMonth.2", label: "Rent index, Tier 2", unit: "₹/sq ft/month" },
  { path: "capex.rentPerSqftMonth.3", label: "Rent index, Tier 3", unit: "₹/sq ft/month" },
  { path: "capex.minSize.1", label: "Minimum space, Tier 1", unit: "sq ft" },
  { path: "capex.minSize.2", label: "Minimum space, Tier 2", unit: "sq ft" },
  { path: "capex.minSize.3", label: "Minimum space, Tier 3", unit: "sq ft" },
  { path: "spacing.km", label: "Spacing between new stores", unit: "km", step: 0.1 },
  { path: "windows.conditionalDays", label: "Conditional reservation", unit: "days" },
];

export function PolicyPanel({ policy, onApply, disabled }: { policy: Policy; onApply: (path: string, value: number | string, label: string) => void; disabled: boolean }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [category, setCategory] = useState(policy.brand.category);
  return (
    <div>
      <p className="text-[13.5px] leading-relaxed text-ink-2">
        Every threshold is illustrative and editable. Changing one re-runs all decisions from the uploaded file under the new policy, then replays your logged updates in order. Approved partners stay locked. Questions like “what if the approval bar were 60?” only simulate.
      </p>
      <label className="mt-4 block text-[13px]">
        <span className="font-medium">Brand product category</span>
        <span className="block text-[12px] text-muted">A setting, never hardcoded. Used in wording only.</span>
        <div className="mt-1 flex gap-2">
          <input value={category} onChange={(e) => setCategory(e.target.value.slice(0, 40))} className="flex-1 rounded-md border border-line bg-bg px-2.5 py-1.5" />
          <button type="button" disabled={disabled || category === policy.brand.category} onClick={() => onApply("brand.category", category, "brand category")} className="rounded-md border border-line px-3 text-[13px] disabled:opacity-40 hover:bg-surface-2">Save</button>
        </div>
      </label>
      <label className="mt-3 block text-[13px]">
        <span className="font-medium">Store format profile</span>
        <span className="block text-[12px] text-muted">Logistics centres care less about ground-floor footfall; this changes floor scoring only.</span>
        <select value={policy.brand.formatProfile} onChange={(e) => onApply("brand.formatProfile", e.target.value, "format profile")} disabled={disabled} className="mt-1 w-full rounded-md border border-line bg-bg px-2.5 py-1.5">
          <option value="retail">Retail store</option>
          <option value="logistics">Logistics or delivery centre</option>
        </select>
      </label>
      <div className="mt-5 divide-y divide-line border-y border-line">
        {FIELDS.map((f) => {
          const cur = String(getPolicyValue(policy, f.path) ?? "");
          const v = draft[f.path] ?? cur;
          const changed = v !== cur && v.trim() !== "" && !Number.isNaN(Number(v));
          return (
            <div key={f.path} className="flex items-center gap-3 py-2 text-[13px]">
              <label htmlFor={f.path} className="flex-1">
                {f.label} <span className="text-muted">({f.unit})</span>
              </label>
              <input id={f.path} inputMode="decimal" value={v} onChange={(e) => setDraft((d) => ({ ...d, [f.path]: e.target.value }))} className="num w-24 rounded-md border border-line bg-bg px-2 py-1 text-right" />
              <button
                type="button"
                disabled={!changed || disabled}
                onClick={() => {
                  onApply(f.path, Number(v), f.label.toLowerCase());
                  setDraft((d) => {
                    const n = { ...d };
                    delete n[f.path];
                    return n;
                  });
                }}
                className="rounded-md px-2.5 py-1 text-[12.5px] font-semibold disabled:opacity-30"
                style={{ background: changed ? "var(--neon)" : "transparent", color: changed ? "var(--on-neon)" : "var(--muted)" }}
              >
                Re-run
              </button>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[12px] text-muted">Policy version {policy.version}. All values are documented in ASSUMPTIONS.md.</p>
    </div>
  );
}

export function MethodPanel({ policy }: { policy: Policy }) {
  const c = policy.capex;
  const s = policy.score;
  const rules: [string, string][] = [
    ["1. Check the data", "Every row is checked first. Missing or contradictory details (a city that does not match its pin, a space marked “not yet identified” with a size filled in, an amount that looks like rupees instead of lakh) put the application on hold with the exact detail needed and who must send it. A hold never uses a slot."],
    ["2. Place it by pin code", `Applications are linked to territories by pin code. A pin outside every territory is declined with a redirect where one exists. The brand never opens two stores in one pin, so a pin that already has our store cannot take a new one. Usable capacity is the smaller of open slots and free pins.`],
    ["3. Check the money", `Estimate = (fit-out + opening stock per sq ft) × size + franchise fee + rent deposit (${c.depositMonths} months) and runway (${c.runwayMonths} months) for rented space + ${c.bufferPct}% buffer. Owned space needs no deposit. Funds under ${c.declineBelowPct}% of the estimate are declined; ${c.declineBelowPct} to 100% go on hold for proof of funds or a co-investor.`],
    ["4. Score 0 to 100", `Funds vs estimate ${s.capital.max}, experience and business relevance ${s.experience.max}, space readiness ${s.space.max} (owned over rented, size vs ideal, ground over mall over upper), timing ${s.timeline.max}, location ${s.territory.max} (territory priority plus distance from our existing stores, weighted by how established they are). Names and language never enter the score.`],
    ["5. Allocate", `Within each territory: ready sites first, then score, investment and ID as tie-breaks. Approval bar ${policy.bars.approval} (High priority ${policy.bars.approval + policy.bars.priorityAdjust.High}, Low ${policy.bars.approval + policy.bars.priorityAdjust.Low}); below ${policy.bars.decline} is declined. Better-spaced sites go first; sites closer than ${policy.spacing.km} km to another new store only if slots remain. Leftover slots are reserved for ${policy.windows.conditionalDays} days for strong applicants still finding a site.`],
    ["6. Lock approvals", "Once approved, a partner is never displaced by a later update. If someone new outranks them, the desk recommends a swap and a person must confirm it."],
    ["7. Check integrity, never accuse", "Possible duplicate identities, the same property on two applications, loan-dependent funding, informal leases, competing-brand ties and unusual fund profiles route to a document check. A signal never declines anyone on its own. Instructions hidden in notes are ignored and logged."],
    ["8. Plan the opening", `KYC and agreement ${policy.timeline.kycAgreementWeeks} weeks, site (owned 0, rented 1, none 6 weeks), fit-out ${policy.timeline.fitoutWeeks} weeks (+3 mall, +1 upper) in parallel with training (Foundation 3, Standard 2 or Accelerated 1 week, in the applicant's language, with a buddy store), then first stock ${policy.timeline.stockPosWeeks} weeks; Tier 3 adds ${policy.timeline.tier3LogisticsWeeks} weeks for logistics.`],
    ["What the AI does", "Only reads follow-up questions in plain language (and Hindi or Kannada) and turns them into commands the rules can run. It never decides or scores, and every answer is built from the engine's output. Without the AI, a rule-based reader handles the same questions in English."],
    ["Distances", `${centroidSource || "Pin centroids"}. No catchment boundaries were provided, so overlap is judged from distances between pin centres.`],
  ];
  return (
    <div className="space-y-4">
      {rules.map(([h, b]) => (
        <section key={h}>
          <h3 className="text-[14px] font-semibold">{h}</h3>
          <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">{b}</p>
        </section>
      ))}
    </div>
  );
}

export function DataNotesPanel({ dataset, log }: { dataset: Dataset; log: LogEntry[] }) {
  return (
    <div className="text-[13px]">
      <p className="text-ink-2">
        {dataset.source === "sample" ? <b>SAMPLE DATA, not real applicants. </b> : null}
        {dataset.fileName}: {dataset.applications.length} applications, {dataset.territories.length} territories, {dataset.stores.length} existing stores.
      </p>
      <h3 className="mt-4 font-semibold">Rows ignored ({dataset.rowsIgnored.length})</h3>
      <ul className="mt-1 space-y-1 text-ink-2">
        {dataset.rowsIgnored.map((r, i) => (
          <li key={i}><span className="num text-muted">{r.sheet} row {r.row}:</span> {r.reason}</li>
        ))}
        {!dataset.rowsIgnored.length && <li className="text-muted">None.</li>}
      </ul>
      <h3 className="mt-4 font-semibold">Notes and issues ({dataset.notes.length})</h3>
      <ul className="mt-1 space-y-1.5">
        {dataset.notes.map((n, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-1 size-1.5 shrink-0 rounded-full" style={{ background: n.severity === "info" ? "var(--line-strong)" : n.severity === "warn" ? "var(--hold)" : "var(--declined)" }} aria-label={n.severity} />
            <span className="text-ink-2">{n.message}</span>
          </li>
        ))}
      </ul>
      <h3 className="mt-4 font-semibold">Updates applied ({log.length})</h3>
      <ul className="mt-1 space-y-1 text-ink-2">
        {log.map((l, i) => (
          <li key={i}><span className="num text-muted">{new Date(l.at).toLocaleTimeString()}</span> {l.update.text}</li>
        ))}
        {!log.length && <li className="text-muted">None yet.</li>}
      </ul>
    </div>
  );
}
