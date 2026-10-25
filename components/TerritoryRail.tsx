"use client";

import type { RunResult, TerritorySummary } from "@/lib/engine/types";

/** Territories as slot strips: scarcity made visible. Solid = approved, hatched = conditional, outline = open, ghost = wanted but no free pin. */
export function TerritoryRail({ result, active, onPick }: { result: RunResult; active: string | null; onPick: (key: string) => void }) {
  return (
    <aside className="border-line lg:border-r lg:sticky lg:top-[53px] lg:h-[calc(100dvh-53px)] lg:overflow-y-auto scrollbar-thin" aria-label="Territories">
      <div className="px-4 pt-4 pb-2 flex items-baseline justify-between">
        <h2 className="text-[13px] font-semibold text-ink-2">Territories</h2>
        <span className="text-[12px] text-muted num">{result.territories.reduce((n, t) => n + t.approved.length + t.conditional.length, 0)} of {result.territories.reduce((n, t) => n + t.effectiveCapacity, 0)} slots used</span>
      </div>
      <ul className="flex gap-2 overflow-x-auto px-4 pb-3 lg:block lg:space-y-1.5 lg:overflow-visible scrollbar-thin">
        {result.territories.map((t) => (
          <li key={t.key} className="shrink-0 lg:shrink">
            <button
              type="button"
              onClick={() => onPick(t.key)}
              aria-pressed={active === t.key}
              className={`w-[220px] lg:w-full rounded-[var(--radius-m)] border px-3 py-2.5 text-left transition-colors ${active === t.key ? "border-gold bg-surface-2" : "border-transparent hover:bg-surface-2"}`}
            >
              <div className="flex items-baseline gap-2">
                <span className="text-[13px] font-semibold num whitespace-nowrap">{t.id}</span>
                <span className="truncate text-[13px] text-ink-2">{t.city}</span>
                <span className="ml-auto shrink-0 whitespace-nowrap text-[11px] text-muted">{t.priority ?? "–"} · T{t.tier ?? "?"}</span>
              </div>
              <SlotStrip t={t} />
              <div className="mt-1.5 text-[11.5px] text-muted leading-snug">
                {t.effectiveCapacity < t.slots ? (
                  <span>
                    <span className="num">{t.slots}</span> wanted, <span className="num">{t.freePins.length}</span> free pin{t.freePins.length === 1 ? "" : "s"}
                  </span>
                ) : (
                  <span>
                    <span className="num">{t.slots}</span> slot{t.slots === 1 ? "" : "s"} · <span className="num">{t.freePins.length}</span> free pins
                  </span>
                )}
                {t.waitlisted.length > 0 && <span> · {t.waitlisted.length} waiting</span>}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function SlotStrip({ t }: { t: TerritorySummary }) {
  const blocks: ("approved" | "conditional" | "open" | "ghost")[] = [];
  t.approved.forEach(() => blocks.push("approved"));
  t.conditional.forEach(() => blocks.push("conditional"));
  for (let i = blocks.length; i < t.effectiveCapacity; i++) blocks.push("open");
  for (let i = t.effectiveCapacity; i < t.slots; i++) blocks.push("ghost");
  const label = `${t.approved.length} approved, ${t.conditional.length} conditional, ${Math.max(0, t.effectiveCapacity - t.approved.length - t.conditional.length)} open${t.slots > t.effectiveCapacity ? `, ${t.slots - t.effectiveCapacity} blocked by lack of free pins` : ""}`;
  return (
    <div className="mt-2 flex gap-1" role="img" aria-label={label} title={label}>
      {blocks.length === 0 && <span className="text-[11px] text-muted">no slots</span>}
      {blocks.map((b, i) => (
        <span
          key={i}
          className={`h-3.5 flex-1 max-w-9 rounded-[3px] ${b === "conditional" ? "hatch" : ""}`}
          style={
            b === "approved"
              ? { background: "var(--gold)" }
              : b === "conditional"
                ? { color: "var(--gold)", boxShadow: "inset 0 0 0 1.5px var(--gold)" }
                : b === "open"
                  ? { boxShadow: "inset 0 0 0 1.5px var(--line-strong)" }
                  : { boxShadow: "inset 0 0 0 1.5px var(--line)", opacity: 0.55, backgroundImage: "repeating-linear-gradient(90deg, var(--line) 0 2px, transparent 2px 5px)" }
          }
        />
      ))}
    </div>
  );
}
