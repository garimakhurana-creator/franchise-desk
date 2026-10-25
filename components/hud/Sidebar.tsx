"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { compareIds } from "@/lib/engine/decide";
import type { Decision, RunResult, Status } from "@/lib/engine/types";
import { Icon, StatusChip, STATUS_LABEL, STATUS_VAR } from "../icons";

const RANK: Record<Status, number> = { APPROVED: 0, CONDITIONAL: 1, WAITLISTED: 2, ON_HOLD: 3, DECLINED: 4, WITHDRAWN: 5 };
const ORDER: Status[] = ["APPROVED", "CONDITIONAL", "WAITLISTED", "ON_HOLD", "DECLINED", "WITHDRAWN"];

/** One sidebar, two lists: applications and territories. Compact rows; full detail lives in the card and the ledger. */
export function Sidebar({
  result,
  selected,
  highlight,
  terrFilter,
  statusFilter,
  onStatus,
  onPickTerritory,
  onSelect,
  onLedger,
}: {
  result: RunResult;
  selected: string | null;
  highlight: string[];
  terrFilter: string | null;
  statusFilter: Status[];
  onStatus: (s: Status[]) => void;
  onPickTerritory: (k: string | null) => void;
  onSelect: (k: string) => void;
  onLedger: () => void;
}) {
  const [tab, setTab] = useState<"apps" | "territories">("apps");
  const [q, setQ] = useState("");
  const list = useRef<HTMLUListElement>(null);
  const decisions = result.decisions;

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let r = decisions;
    if (terrFilter) r = r.filter((d) => d.territoryKey === terrFilter);
    if (statusFilter.length) r = r.filter((d) => statusFilter.includes(d.status));
    if (needle) r = r.filter((d) => [d.id, d.name, d.pin ?? "", d.territoryId ?? "", d.why, d.nextStep].some((x) => x.toLowerCase().includes(needle)));
    return [...r].sort((a, b) => RANK[a.status] - RANK[b.status] || (b.score?.total ?? -1) - (a.score?.total ?? -1) || compareIds(a.key, b.key));
  }, [decisions, terrFilter, statusFilter, q]);

  useEffect(() => {
    if (!highlight.length) return;
    setTab("apps");
    requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(highlight[0])}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }, [highlight]);

  const terrName = terrFilter ? result.territories.find((t) => t.key === terrFilter)?.id : null;
  const counts = Object.fromEntries(ORDER.map((s) => [s, decisions.filter((d) => d.status === s).length])) as Record<Status, number>;

  return (
    <aside className="flex h-full min-h-0 flex-col border-line bg-[#080e16] lg:border-r" aria-label="Applications and territories">
      <div className="flex items-center gap-1 border-b border-line px-3 pt-2" role="tablist">
        {([["apps", `Applications`, decisions.length], ["territories", `Territories`, result.territories.length]] as const).map(([k, label, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-2.5 py-2 text-[13px] font-medium transition-colors ${tab === k ? "border-gold text-ink" : "border-transparent text-muted hover:text-ink"}`}>
            {label} <span className="num ml-0.5 text-muted">{n}</span>
          </button>
        ))}
        <button type="button" onClick={onLedger} className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] text-ink-2 hover:bg-surface-2 hover:text-ink" title="Every application in one table">
          <Icon.Table size={14} /> Ledger
        </button>
      </div>

      {tab === "apps" ? (
        <>
          <div className="space-y-2 px-3 pt-3">
            <label className="relative block">
              <span className="sr-only">Search applications</span>
              <Icon.Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ID, name, pin or reason" className="w-full rounded-md border border-line bg-surface py-1.5 pl-8 pr-2 text-[13px] placeholder:text-muted focus:border-line-strong focus:outline-none" />
            </label>
            <div className="flex flex-wrap gap-1">
              {ORDER.filter((s) => counts[s]).map((s) => {
                const on = statusFilter.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onStatus(on ? statusFilter.filter((x) => x !== s) : [...statusFilter, s])}
                    aria-pressed={on}
                    className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[12px] transition-colors"
                    style={{ borderColor: on ? STATUS_VAR[s] : "var(--line)", color: on ? STATUS_VAR[s] : "var(--ink-2)", background: on ? `color-mix(in srgb, ${STATUS_VAR[s]} 12%, transparent)` : "transparent" }}
                  >
                    <i className="inline-block size-1.5 rounded-full" style={{ background: STATUS_VAR[s] }} />
                    {STATUS_LABEL[s]} <span className="num text-muted">{counts[s]}</span>
                  </button>
                );
              })}
              {terrName && (
                <button type="button" onClick={() => onPickTerritory(null)} className="inline-flex items-center gap-1 rounded-full border border-gold/60 px-2 py-0.5 text-[12px] text-gold">
                  {terrName} <Icon.Close size={11} />
                </button>
              )}
            </div>
          </div>
          <ul ref={list} className="scrollbar-thin mt-2 min-h-0 flex-1 overflow-y-auto">
            {rows.map((d) => (
              <AppRow key={d.key} d={d} selected={d.key === selected} highlighted={highlight.includes(d.key)} onSelect={onSelect} />
            ))}
            {!rows.length && <li className="px-4 py-8 text-center text-[13px] text-muted">No applications match.</li>}
          </ul>
          <div className="border-t border-line px-3 py-1.5 text-[11.5px] text-muted">
            Showing <span className="num">{rows.length}</span> of <span className="num">{decisions.length}</span>
          </div>
        </>
      ) : (
        <ul className="scrollbar-thin min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
          {result.territories.map((t) => {
            const ds = decisions.filter((d) => d.territoryKey === t.key);
            const mix = ORDER.map((s) => [s, ds.filter((d) => d.status === s).length] as const).filter(([, n]) => n);
            const pips: string[] = [];
            t.approved.forEach(() => pips.push("filled"));
            t.conditional.forEach(() => pips.push("reserved"));
            for (let k = pips.length; k < t.effectiveCapacity; k++) pips.push("open");
            for (let k = t.effectiveCapacity; k < t.slots; k++) pips.push("blocked");
            const on = terrFilter === t.key;
            return (
              <li key={t.key}>
                <button type="button" onClick={() => onPickTerritory(on ? null : t.key)} aria-pressed={on} className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${on ? "border-gold/70 bg-surface-2" : "border-transparent hover:bg-surface"}`}>
                  <div className="flex items-baseline gap-2">
                    <span className="num whitespace-nowrap text-[13.5px] font-semibold">{t.id}</span>
                    <span className="truncate text-[13px] text-ink-2">{t.city}</span>
                    <span className="ml-auto shrink-0 text-[11.5px] text-muted">
                      {t.priority ?? "–"} priority · Tier {t.tier ?? "?"}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-1">
                    {pips.length ? pips.map((p, k) => <i key={k} className={`pip ${p}`} />) : <span className="text-[11.5px] text-muted">no slots</span>}
                    <span className="ml-auto text-[12px] text-ink-2">
                      <span className="num font-semibold text-ink">{ds.length}</span> requests · <span className="num">{t.approved.length + t.conditional.length}/{t.effectiveCapacity}</span> slots
                    </span>
                  </div>
                  <div className="mt-2 flex h-1 gap-px overflow-hidden rounded-full bg-surface-3">
                    {mix.map(([s, n]) => (
                      <i key={s} style={{ flex: n, background: STATUS_VAR[s] }} title={`${STATUS_LABEL[s]}: ${n}`} />
                    ))}
                  </div>
                  {t.bindingReason && <p className="mt-1.5 text-[11.5px] leading-snug text-muted">{t.slots} wanted, only {t.freePins.length} free pin{t.freePins.length === 1 ? "" : "s"}: can host {t.effectiveCapacity}</p>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

function AppRow({ d, selected, highlighted, onSelect }: { d: Decision; selected: boolean; highlighted: boolean; onSelect: (k: string) => void }) {
  return (
    <li className="vrow">
      <button
        type="button"
        data-key={d.key}
        data-status={d.status}
        onClick={() => onSelect(d.key)}
        className={`w-full border-b border-line/60 px-3 py-2.5 text-left transition-colors ${selected ? "bg-surface-2" : highlighted ? "bg-surface" : "hover:bg-surface"}`}
        style={{ boxShadow: selected ? `inset 3px 0 0 ${STATUS_VAR[d.status]}` : highlighted ? "inset 3px 0 0 var(--gold)" : undefined }}
      >
        <div className="flex items-center gap-2">
          <span className="num text-[13px] font-semibold">{d.id}</span>
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">{d.name}</span>
          {d.score && <span className="num text-[12px] text-muted" title="Score out of 100">{d.score.total}</span>}
          <StatusChip status={d.status} size="sm" />
        </div>
        <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-ink-2">{d.why.replace(/^[^:]+:\s*/, "")}</p>
        <p className="mt-0.5 truncate text-[11.5px] text-muted" title={d.nextStep}>
          <span className="text-ink-2">{d.owner}</span> · {d.nextStep}
        </p>
      </button>
    </li>
  );
}
