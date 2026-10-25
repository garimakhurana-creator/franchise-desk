"use client";

import type { RunResult, Status } from "@/lib/engine/types";
import { STATUS_VAR } from "../icons";

const ORDER: Status[] = ["APPROVED", "CONDITIONAL", "WAITLISTED", "ON_HOLD", "DECLINED", "WITHDRAWN"];
const PRIORITY_COLOR: Record<string, string> = { High: "var(--approved)", Medium: "var(--gold)", Low: "var(--muted)" };

/** Territories as missions: slot pips, requests, status mix. Click to fly there and filter the roster. */
export function MissionPanel({ result, active, onPick }: { result: RunResult; active: string | null; onPick: (key: string | null) => void }) {
  const totalCap = result.territories.reduce((n, t) => n + t.effectiveCapacity, 0);
  const used = result.territories.reduce((n, t) => n + t.approved.length + t.conditional.length, 0);
  return (
    <aside className="hud hud-panel flex max-h-full min-h-0 flex-col" aria-label="Territories">
      <div className="flex items-baseline justify-between px-4 pt-3.5 pb-2">
        <h2 className="hud-label text-[12px] text-ink-2">Territories</h2>
        <span className="hud-num text-[12px] text-muted">
          {used}/{totalCap} slots
        </span>
      </div>
      <ul className="scrollbar-thin flex gap-2 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-y-auto lg:overflow-x-visible">
        {result.territories.map((t, i) => {
          const ds = result.decisions.filter((d) => d.territoryKey === t.key);
          const counts = ORDER.map((s) => [s, ds.filter((d) => d.status === s).length] as const).filter(([, n]) => n);
          const pips: ("filled" | "reserved" | "open" | "blocked")[] = [];
          t.approved.forEach(() => pips.push("filled"));
          t.conditional.forEach(() => pips.push("reserved"));
          for (let k = pips.length; k < t.effectiveCapacity; k++) pips.push("open");
          for (let k = t.effectiveCapacity; k < t.slots; k++) pips.push("blocked");
          const on = active === t.key;
          return (
            <li key={t.key} className="card-in shrink-0 lg:shrink" style={{ ["--i" as string]: `${i * 60}ms` }}>
              <button
                type="button"
                onClick={() => onPick(on ? null : t.key)}
                aria-pressed={on}
                className={`w-[236px] rounded-lg border px-3 py-2.5 text-left transition-all lg:w-full ${on ? "border-gold bg-surface-3 shadow-[0_0_0_1px_var(--gold),0_0_24px_-6px_#f5c45188]" : "border-line/60 bg-surface/60 hover:border-line-strong hover:bg-surface-2"}`}
              >
                <div className="flex items-center gap-2">
                  <span className="hud-num whitespace-nowrap text-[15px] text-ink">{t.id}</span>
                  <span className="truncate text-[13px] text-ink-2" style={{ fontFamily: "var(--font-sans)" }}>
                    {t.city}
                  </span>
                  <span className="hud-label ml-auto shrink-0 text-[9.5px]" style={{ color: PRIORITY_COLOR[t.priority ?? "Medium"] }}>
                    {t.priority ?? "–"} · T{t.tier ?? "?"}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-1.5" role="img" aria-label={`${t.approved.length} approved, ${t.conditional.length} reserved, ${Math.max(0, t.effectiveCapacity - t.approved.length - t.conditional.length)} open, ${Math.max(0, t.slots - t.effectiveCapacity)} blocked by pins`}>
                  {pips.length ? pips.map((p, k) => <i key={k} className={`pip ${p}`} />) : <span className="text-[11px] text-muted">no slots</span>}
                  <span className="hud-num ml-auto text-[13px] text-ink-2">
                    {ds.length}
                    <span className="text-[10px] font-semibold tracking-wider text-muted"> REQ</span>
                  </span>
                </div>
                <div className="mt-2 flex h-1 gap-px overflow-hidden rounded-full bg-surface-3">
                  {counts.map(([s, n]) => (
                    <i key={s} style={{ flex: n, background: STATUS_VAR[s] }} title={`${s}: ${n}`} />
                  ))}
                </div>
                {t.bindingReason && <p className="mt-1.5 text-[11px] leading-snug text-muted" style={{ fontFamily: "var(--font-sans)" }}>{t.slots} wanted, {t.freePins.length} free pin{t.freePins.length === 1 ? "" : "s"}</p>}
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
