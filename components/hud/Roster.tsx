"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { compareIds } from "@/lib/engine/decide";
import type { Decision, Status } from "@/lib/engine/types";
import { Icon, STATUS_LABEL, STATUS_VAR } from "../icons";

const RANK: Record<Status, number> = { APPROVED: 0, CONDITIONAL: 1, WAITLISTED: 2, ON_HOLD: 3, DECLINED: 4, WITHDRAWN: 5 };
const TABS: { key: "all" | Status; label: string }[] = [
  { key: "all", label: "All" },
  { key: "APPROVED", label: "Approved" },
  { key: "CONDITIONAL", label: "Reserved" },
  { key: "WAITLISTED", label: "Waitlist" },
  { key: "ON_HOLD", label: "Hold" },
  { key: "DECLINED", label: "Declined" },
];

const initials = (name: string, id: string) => (name.trim() ? name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() : id.slice(-2));

/** Every applicant as a roster card: status, score as XP against the bar, the reason, next step and owner. */
export function Roster({
  decisions,
  selected,
  highlight,
  terrFilter,
  statusFilter,
  onStatus,
  onClearTerritory,
  onSelect,
  onLedger,
}: {
  decisions: Decision[];
  selected: string | null;
  highlight: string[];
  terrFilter: string | null;
  statusFilter: Status[];
  onStatus: (s: Status[]) => void;
  onClearTerritory: () => void;
  onSelect: (k: string) => void;
  onLedger: () => void;
}) {
  const [q, setQ] = useState("");
  const list = useRef<HTMLUListElement>(null);
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
    list.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(highlight[0])}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlight]);

  const tab = statusFilter.length === 1 ? statusFilter[0] : statusFilter.length === 0 ? "all" : null;
  const terrName = terrFilter ? decisions.find((d) => d.territoryKey === terrFilter)?.territoryId : null;

  return (
    <section className="hud hud-panel flex max-h-full min-h-0 flex-col" aria-label="Applicant roster">
      <div className="flex items-center gap-2 px-4 pt-3.5">
        <h2 className="hud-label text-[12px] text-ink-2">Roster</h2>
        <span className="hud-num text-[12px] text-muted">
          {rows.length}/{decisions.length}
        </span>
        {terrName && (
          <button type="button" onClick={onClearTerritory} className="hud-label ml-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-gold hover:bg-surface-2" style={{ boxShadow: "inset 0 0 0 1px var(--hud-edge)" }}>
            {terrName} <Icon.Close size={11} />
          </button>
        )}
        <button type="button" onClick={onLedger} className="hud-label ml-auto inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10.5px] text-ink-2 hover:bg-surface-2 hover:text-ink" title="Open the full table of every application">
          <Icon.Table size={14} /> Ledger
        </button>
      </div>
      <div className="flex gap-1 overflow-x-auto px-3 pt-2.5 scrollbar-thin" role="tablist" aria-label="Filter by status">
        {TABS.map((t) => {
          const on = tab === t.key;
          const n = t.key === "all" ? decisions.length : decisions.filter((d) => d.status === t.key).length;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onStatus(t.key === "all" ? [] : [t.key])}
              className={`hud-label shrink-0 rounded px-2 py-1 text-[10.5px] transition-colors ${on ? "bg-surface-3 text-ink" : "hover:bg-surface-2"}`}
              style={on && t.key !== "all" ? { color: STATUS_VAR[t.key as Status], boxShadow: `inset 0 -2px 0 ${STATUS_VAR[t.key as Status]}` } : on ? { boxShadow: "inset 0 -2px 0 var(--gold)" } : undefined}
            >
              {t.label} <span className="hud-num opacity-70">{n}</span>
            </button>
          );
        })}
      </div>
      <label className="relative mx-3 mt-2.5 block">
        <span className="sr-only">Search the roster</span>
        <Icon.Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ID, name, pin, reason" className="w-full rounded-md border border-line bg-bg/70 py-1.5 pl-8 pr-2 text-[13px] placeholder:text-muted focus:border-line-strong focus:outline-none" style={{ fontFamily: "var(--font-sans)" }} />
      </label>
      <ul ref={list} className="scrollbar-thin mt-2.5 min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        {rows.map((d, i) => {
          const c = STATUS_VAR[d.status];
          const sel = d.key === selected;
          const hi = highlight.includes(d.key);
          const s = d.score?.total ?? null;
          return (
            <li key={d.key} className="card-in vrow" style={{ ["--i" as string]: `${Math.min(i, 14) * 35}ms` }}>
              <button
                type="button"
                data-key={d.key}
                data-status={d.status}
                onClick={() => onSelect(d.key)}
                className={`group w-full rounded-lg border px-3 py-2.5 text-left transition-all ${sel ? "bg-surface-3" : "bg-surface/50 hover:bg-surface-2"}`}
                style={{ borderColor: sel ? c : hi ? "var(--gold)" : "color-mix(in srgb, var(--line) 70%, transparent)", boxShadow: sel ? `0 0 0 1px ${c}, 0 0 26px -8px ${c}` : hi ? "0 0 22px -8px var(--gold)" : undefined }}
              >
                <div className="flex items-center gap-2.5">
                  <span className="avatar" style={{ background: c }} aria-hidden>
                    {initials(d.name, d.id)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="hud-num text-[14px] text-ink">{d.id}</span>
                      <span className="truncate text-[12.5px] text-ink-2" style={{ fontFamily: "var(--font-sans)" }}>
                        {d.name}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
                      <span className="hud-label text-[10px]" style={{ color: c }}>
                        {STATUS_LABEL[d.status]}
                      </span>
                      <span aria-hidden>·</span>
                      <span className="hud-num">{d.territoryId ?? "no territory"}</span>
                      <span aria-hidden>·</span>
                      <span className="hud-num">{d.allocatedPin ?? d.pin ?? "–"}</span>
                    </span>
                  </span>
                  {s !== null && (
                    <span className="hud-num text-right text-[18px] leading-none" style={{ color: c }} title="Score out of 100">
                      {s}
                      <span className="block text-[9px] font-semibold tracking-widest text-muted">SCORE</span>
                    </span>
                  )}
                </div>
                {s !== null && (
                  <div className="xp mt-2" title={`Score ${s} vs bar ${d.bar ?? "–"}`}>
                    <i style={{ width: `${s}%`, background: `linear-gradient(90deg, color-mix(in srgb, ${c} 45%, transparent), ${c})`, boxShadow: `0 0 10px -2px ${c}` }} />
                    {d.bar !== null && <b style={{ left: `${d.bar}%` }} aria-hidden />}
                  </div>
                )}
                <p className="mt-2 text-[12.5px] leading-snug text-ink" style={{ fontFamily: "var(--font-sans)" }}>
                  {d.why.replace(/^[^:]+:\s*/, "")}
                </p>
                <p className="mt-1 text-[11.5px] leading-snug text-muted" style={{ fontFamily: "var(--font-sans)" }}>
                  <span className="hud-label mr-1 text-[9.5px] text-gold">{d.owner}</span>
                  {d.nextStep}
                </p>
              </button>
            </li>
          );
        })}
        {!rows.length && <li className="px-2 py-8 text-center text-[13px] text-muted">No applicants match.</li>}
      </ul>
    </section>
  );
}
