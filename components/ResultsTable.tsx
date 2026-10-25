"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { compareIds } from "@/lib/engine/decide";
import type { Decision, Status } from "@/lib/engine/types";
import { Icon, StatusChip } from "./icons";

type SortKey = "id" | "name" | "territory" | "pin" | "status" | "score" | "owner";
const STATUS_RANK: Record<Status, number> = { APPROVED: 0, CONDITIONAL: 1, WAITLISTED: 2, ON_HOLD: 3, DECLINED: 4, WITHDRAWN: 5 };

export function ResultsTable({
  decisions,
  selected,
  highlight,
  terrFilter,
  statusFilter,
  onClearFilters,
  onSelect,
}: {
  decisions: Decision[];
  selected: string | null;
  highlight: string[];
  terrFilter: string | null;
  statusFilter: Status[];
  onClearFilters: () => void;
  onSelect: (k: string) => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "id", dir: 1 });
  const [q, setQ] = useState("");
  const body = useRef<HTMLTableSectionElement>(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let r = decisions;
    if (terrFilter) r = r.filter((d) => d.territoryKey === terrFilter);
    if (statusFilter.length) r = r.filter((d) => statusFilter.includes(d.status));
    if (needle) r = r.filter((d) => [d.id, d.name, d.pin ?? "", d.territoryId ?? "", d.why, d.nextStep].some((x) => x.toLowerCase().includes(needle)));
    const cmp = (a: Decision, b: Decision): number => {
      switch (sort.key) {
        case "name":
          return a.name.localeCompare(b.name);
        case "territory":
          return (a.territoryId ?? "~").localeCompare(b.territoryId ?? "~") || compareIds(a.key, b.key);
        case "pin":
          return (a.pin ?? "~").localeCompare(b.pin ?? "~");
        case "status":
          return STATUS_RANK[a.status] - STATUS_RANK[b.status] || compareIds(a.key, b.key);
        case "score":
          return (b.score?.total ?? -1) - (a.score?.total ?? -1);
        case "owner":
          return a.owner.localeCompare(b.owner);
        default:
          return compareIds(a.key, b.key);
      }
    };
    return [...r].sort((a, b) => cmp(a, b) * sort.dir);
  }, [decisions, terrFilter, statusFilter, q, sort]);

  useEffect(() => {
    if (!highlight.length) return;
    const el = body.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(highlight[0])}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlight]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const i = rows.findIndex((r) => r.key === selected);
    const next = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
    if (next) {
      onSelect(next.key);
      body.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(next.key)}"]`)?.focus();
    }
  };

  const Th = ({ k, children, className = "" }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th scope="col" className={`px-3 py-2 text-left font-medium ${className}`} aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-ink" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? ((-s.dir) as 1 | -1) : 1 }))}>
        {children}
        {sort.key === k && <span aria-hidden className="text-[10px]">{sort.dir === 1 ? "▲" : "▼"}</span>}
      </button>
    </th>
  );

  const filtered = terrFilter || statusFilter.length || q;
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[200px] max-w-[420px]">
          <span className="sr-only">Search applications</span>
          <Icon.Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ID, name, pin or reason" className="w-full rounded-full border border-line bg-surface py-2 pl-9 pr-3 text-[14px] placeholder:text-muted focus:border-line-strong focus:outline-none" />
        </label>
        <span className="text-[13px] text-muted num">
          {rows.length} of {decisions.length} shown
        </span>
        {filtered && (
          <button type="button" onClick={() => { onClearFilters(); setQ(""); }} className="text-[13px] underline decoration-dotted underline-offset-2 text-ink-2 hover:text-ink">
            Clear filters
          </button>
        )}
      </div>

      {/* Desktop table */}
      <div className="mt-3 hidden xl:block rounded-[var(--radius-l)] border border-line bg-surface" style={{ boxShadow: "var(--shadow)" }}>
        <table className="w-full table-fixed border-separate border-spacing-0 text-[13.5px]" onKeyDown={onKey}>
          <caption className="sr-only">Every application with its decision, reason, next step and owner</caption>
          <colgroup>
            <col className="w-[92px]" />
            <col className="w-[150px]" />
            <col className="w-[86px]" />
            <col className="w-[78px]" />
            <col className="w-[132px]" />
            <col />
            <col className="w-[26%]" />
            <col className="w-[104px]" />
          </colgroup>
          <thead className="text-[12px] text-ink-2 [&_th]:sticky [&_th]:top-[53px] [&_th]:z-10 [&_th]:bg-surface-2 [&_th]:border-b [&_th]:border-line [&_th:first-child]:rounded-tl-[var(--radius-l)] [&_th:last-child]:rounded-tr-[var(--radius-l)]">
            <tr>
              <Th k="id">ID</Th>
              <Th k="name">Applicant</Th>
              <Th k="territory">Territory</Th>
              <Th k="pin">Pin</Th>
              <Th k="status">Status</Th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Why</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Next step</th>
              <Th k="owner">Owner</Th>
            </tr>
          </thead>
          <tbody ref={body}>
            {rows.map((d) => {
              const isSel = d.key === selected;
              const isHi = highlight.includes(d.key);
              return (
                <tr
                  key={d.key}
                  data-key={d.key}
                  data-status={d.status}
                  tabIndex={0}
                  onClick={() => onSelect(d.key)}
                  onKeyDown={(e) => e.key === "Enter" && onSelect(d.key)}
                  aria-selected={isSel}
                  className={`vrow cursor-pointer align-top transition-colors [&>td]:border-t [&>td]:border-line ${isSel ? "bg-surface-3" : isHi ? "bg-surface-2" : "hover:bg-surface-2"}`}
                  style={isHi && !isSel ? { boxShadow: "inset 3px 0 0 var(--gold)" } : isSel ? { boxShadow: "inset 3px 0 0 var(--ink)" } : undefined}
                >
                  <td className="num px-3 py-2.5 font-semibold whitespace-nowrap">{d.id}</td>
                  <td className="px-3 py-2.5 truncate" title={d.name}>{d.name || <span className="text-muted">–</span>}</td>
                  <td className="num px-3 py-2.5 text-ink-2">{d.territoryId ?? <span className="text-muted">none</span>}</td>
                  <td className="num px-3 py-2.5 text-ink-2">{d.allocatedPin ?? d.pin ?? "–"}</td>
                  <td className="px-3 py-2.5">
                    <StatusChip status={d.status} size="sm" />
                  </td>
                  <td className="px-3 py-2.5 leading-snug">{d.why.replace(/^[^:]+:\s*/, "")}</td>
                  <td className="px-3 py-2.5 leading-snug text-ink-2">{d.nextStep}</td>
                  <td className="px-3 py-2.5 text-ink-2">{d.owner}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <p className="px-4 py-8 text-center text-[14px] text-muted">No applications match these filters.</p>}
      </div>

      {/* Mobile cards: same fields, nothing hidden behind a click */}
      <ul className="mt-3 grid gap-2 md:grid-cols-2 xl:hidden">
        {rows.map((d) => (
          <li key={d.key} className="vrow">
            <button type="button" data-key={d.key} data-status={d.status} onClick={() => onSelect(d.key)} className={`w-full rounded-[var(--radius-m)] border p-3 text-left ${d.key === selected ? "border-ink bg-surface-2" : highlight.includes(d.key) ? "border-gold bg-surface" : "border-line bg-surface"}`}>
              <div className="flex items-center gap-2">
                <span className="num font-semibold">{d.id}</span>
                <span className="truncate text-[13px] text-ink-2">{d.name}</span>
                <span className="ml-auto"><StatusChip status={d.status} size="sm" /></span>
              </div>
              <p className="mt-1.5 text-[13.5px] leading-snug">{d.why.replace(/^[^:]+:\s*/, "")}</p>
              <p className="mt-1 text-[12.5px] text-muted leading-snug">
                <span className="font-medium text-ink-2">{d.owner}:</span> {d.nextStep}
              </p>
              <p className="mt-1 text-[11.5px] text-muted num">{d.territoryId ?? "no territory"} · pin {d.allocatedPin ?? d.pin ?? "–"}</p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
