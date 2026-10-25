"use client";

import { useEffect, useState } from "react";
import type { RunResult, Status } from "@/lib/engine/types";
import { Icon, StatusGlyph, STATUS_VAR } from "../icons";

const COUNTERS: { s: Status; label: string }[] = [
  { s: "APPROVED", label: "Approved" },
  { s: "CONDITIONAL", label: "Reserved" },
  { s: "WAITLISTED", label: "Waitlist" },
  { s: "ON_HOLD", label: "On hold" },
  { s: "DECLINED", label: "Declined" },
];

/** Counts up from 0 once, then follows the value. Instant under reduced motion. */
function useCount(target: number) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setV(target);
      return;
    }
    let raf = 0;
    const from = v;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 900);
      setV(Math.round(from + (target - from) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return v;
}

function Counter({ s, label, n, on, onClick }: { s: Status; label: string; n: number; on: boolean; onClick: () => void }) {
  const v = useCount(n);
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={`group flex min-w-[92px] items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors ${on ? "bg-surface-3" : "hover:bg-surface-2"}`} title={`Filter the roster: ${label}`}>
      <StatusGlyph status={s} size={18} />
      <span className="flex flex-col leading-none">
        <span className="hud-num glow text-[22px]" style={{ color: STATUS_VAR[s] }}>{v}</span>
        <span className="hud-label mt-1 text-[10px]">{label}</span>
      </span>
    </button>
  );
}

export function HudStats({ result, statusFilter, onStatus, sample }: { result: RunResult; statusFilter: Status[]; onStatus: (s: Status[]) => void; sample: boolean }) {
  const count = (s: Status) => result.decisions.filter((d) => d.status === s).length;
  const cap = result.territories.reduce((n, t) => n + t.effectiveCapacity, 0);
  const used = result.territories.reduce((n, t) => n + t.approved.length + t.conditional.length, 0);
  const moving = count("APPROVED") + count("CONDITIONAL");
  const toggle = (s: Status) => onStatus(statusFilter.includes(s) ? statusFilter.filter((x) => x !== s) : [...statusFilter, s]);
  return (
    <div className="hud hud-panel flex flex-wrap items-center gap-x-2 gap-y-2 px-3 py-2">
      <div className="mr-2 flex flex-col leading-none">
        <span className="hud-label">Moving forward</span>
        <span className="hud-num mt-1 text-[26px] text-ink">
          {moving}
          <span className="text-[15px] text-muted"> / {result.decisions.length}</span>
        </span>
      </div>
      <span className="mx-1 hidden h-9 w-px bg-line sm:block" aria-hidden />
      {COUNTERS.map((c) => (
        <Counter key={c.s} s={c.s} label={c.label} n={count(c.s)} on={statusFilter.includes(c.s)} onClick={() => toggle(c.s)} />
      ))}
      <span className="mx-1 hidden h-9 w-px bg-line lg:block" aria-hidden />
      <div className="flex flex-col leading-none" title="Usable slots = the smaller of open slots and free pins in each territory">
        <span className="hud-label">Slots filled</span>
        <span className="mt-1.5 flex items-center gap-1">
          {Array.from({ length: cap }).map((_, i) => (
            <i key={i} className={`pip ${i < used ? "filled" : "open"}`} style={{ width: 10, height: 12 }} />
          ))}
          <span className="hud-num ml-1.5 text-[14px] text-ink-2">
            {used}/{cap}
          </span>
        </span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {sample && <span className="hud-label rounded px-2 py-1 text-[10px]" style={{ background: "var(--gold-soft)", color: "var(--gold)" }}>Sample data</span>}
        <span
          className="hud flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold"
          style={{ color: result.pinConflicts ? "var(--declined)" : "var(--approved)", background: `color-mix(in srgb, ${result.pinConflicts ? "var(--declined)" : "var(--approved)"} 12%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${result.pinConflicts ? "var(--declined)" : "var(--approved)"} 40%, transparent)` }}
          title="No two approved or conditional partners share a pin code, and none sits on an existing store's pin."
        >
          <Icon.Shield size={16} /> Pin rule verified: <span className="hud-num">{result.pinConflicts}</span> conflicts
        </span>
      </div>
    </div>
  );
}
