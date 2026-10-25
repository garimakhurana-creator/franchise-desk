"use client";

import { useState } from "react";
import type { Check } from "@/lib/engine/selftest";
import type { Tower } from "@/lib/engine/tower";
import { Icon } from "./icons";

export function SelfTestPanel({ run }: { run: () => Check[] }) {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="text-[13.5px]">
      <p className="leading-relaxed text-ink-2">
        Re-runs the engine on this file with rows shuffled, IDs in lower case, and names and languages swapped between applicants, then checks the hard rules. Everything runs in your browser.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setTimeout(() => {
            setChecks(run());
            setBusy(false);
          }, 30);
        }}
        className="mt-3 inline-flex items-center gap-2 rounded-full px-4 py-2 text-[14px] font-semibold disabled:opacity-60"
        style={{ background: "var(--gold)", color: "var(--on-gold)" }}
      >
        <Icon.Shield /> {busy ? "Running…" : checks ? "Run again" : "Run self-test"}
      </button>
      {checks && (
        <ul className="mt-4 space-y-2" aria-live="polite">
          {checks.map((c) => (
            <li key={c.name} className="rise rounded-[var(--radius-m)] border px-3 py-2" style={{ borderColor: c.pass ? "color-mix(in srgb, var(--approved) 45%, transparent)" : "var(--declined)" }}>
              <div className="flex items-center gap-2 font-medium">
                <span style={{ color: c.pass ? "var(--approved)" : "var(--declined)" }}>{c.pass ? <Icon.Check /> : <Icon.Close />}</span>
                {c.name}
                <span className="num ml-auto text-[11.5px] text-muted">{c.ms} ms</span>
              </div>
              <div className="mt-0.5 pl-6 text-ink-2">
                {c.pass ? "Pass" : "Fail"}: {c.detail}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TowerPanel({ tower, onSelect, onSimulate }: { tower: Tower; onSelect: (k: string) => void; onSimulate: (days: number) => void }) {
  const maxOpen = Math.max(1, ...tower.openings.map((o) => o.expected));
  return (
    <div className="space-y-6 text-[13.5px]">
      <section>
        <h3 className="font-semibold">Who to call first today</h3>
        <p className="mt-0.5 text-[12px] text-muted">Ranked by money at stake and how soon a window closes.</p>
        <ol className="mt-2 space-y-1.5">
          {tower.calls.map((c, i) => (
            <li key={c.key}>
              <button type="button" onClick={() => onSelect(c.key)} className="w-full rounded-[var(--radius-m)] border border-line px-3 py-2 text-left hover:bg-surface-2">
                <div className="flex items-baseline gap-2">
                  <span className="num text-muted">{i + 1}</span>
                  <span className="num font-semibold">{c.id}</span>
                  <span className="text-[12px] text-muted">{c.owner}</span>
                  <span className="num ml-auto text-[12px] text-muted">
                    ₹{Math.round(c.valueLakh)} lakh{c.daysLeft ? ` · ${c.daysLeft} days` : ""}
                  </span>
                </div>
                <div className="mt-0.5 leading-snug">{c.action}</div>
              </button>
            </li>
          ))}
          {!tower.calls.length && <li className="text-muted">Nothing urgent.</li>}
        </ol>
      </section>

      <section>
        <h3 className="font-semibold">Expected openings by month</h3>
        <p className="mt-0.5 text-[12px] text-muted">Risk-adjusted: each partner counts by an illustrative chance of opening (approved 0.85, reserved with a site 0.65, still finding a site 0.45, less for open checks).</p>
        <ul className="mt-2 space-y-1.5">
          {tower.openings.map((o) => (
            <li key={o.month} className="grid grid-cols-[72px_1fr_44px] items-center gap-2">
              <span className="text-ink-2">{o.month}</span>
              <span className="relative h-3 rounded-full bg-surface-3" aria-hidden>
                <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(o.expected / maxOpen) * 100}%`, background: "var(--gold)" }} />
              </span>
              <span className="num text-right">{o.expected}</span>
              <span className="col-span-3 -mt-1 text-[11.5px] text-muted">{o.ids.join(", ")}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="font-semibold">Demand gap</h3>
        <ul className="mt-2 space-y-1.5">
          {tower.gap.map((g) => (
            <li key={g.territory} className="flex gap-2">
              <span className="num w-14 shrink-0 font-medium">{g.territory}</span>
              <span className="text-ink-2">{g.action}</span>
            </li>
          ))}
          {!tower.gap.length && <li className="text-muted">Every usable slot is allocated.</li>}
        </ul>
      </section>

      <section>
        <h3 className="font-semibold">Capacity plan</h3>
        <dl className="mt-2 grid grid-cols-2 gap-3">
          <div>
            <dt className="text-[12px] text-muted">Capital committed by partners</dt>
            <dd className="num text-[18px] font-semibold">₹{tower.capacity.committedLakh} lakh</dd>
          </div>
          <div>
            <dt className="text-[12px] text-muted">Field verifications to schedule</dt>
            <dd className="num text-[18px] font-semibold">{tower.capacity.fieldVisits}</dd>
          </div>
        </dl>
        <div className="mt-3 text-[12px] text-muted">Training seats by language and start week</div>
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {tower.capacity.trainingSeats.map((s) => (
            <li key={`${s.language}${s.week}`} className="rounded-full border border-line px-2 py-0.5 text-[12px]">
              <span className="num">W{s.week}</span> · {s.language} · <span className="num">{s.seats}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 text-[12px] text-muted">Opening waves</div>
        <ul className="mt-1 space-y-0.5 text-[12.5px]">
          {tower.capacity.waves.map((w) => (
            <li key={w.month}>
              <span className="font-medium">{w.month}</span>: {w.ids.join(", ")}
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-line pt-4">
        <h3 className="font-semibold">Time</h3>
        <p className="mt-0.5 text-[12px] text-muted">See what happens with no news: reservations without a site lapse to the next in line after 30 days; holds with no reply close after 14.</p>
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={() => onSimulate(14)} className="rounded-full border border-line px-3 py-1.5 text-[13px] hover:bg-surface-2">
            Simulate 14 days
          </button>
          <button type="button" onClick={() => onSimulate(30)} className="rounded-full border border-line px-3 py-1.5 text-[13px] hover:bg-surface-2">
            Simulate 30 days
          </button>
        </div>
        <p className="mt-1 text-[11.5px] text-muted">Undo it from the desk with “undo”.</p>
      </section>
    </div>
  );
}
