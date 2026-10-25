"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CODE_LABEL } from "@/lib/engine/codes";
import { counterfactualSentence } from "@/lib/engine/counterfactual";
import { heldPercent } from "@/lib/engine/stability";
import { applicantMessage } from "@/lib/engine/messages";
import { fmtDate } from "@/lib/engine/plan";
import type { Session, Step } from "@/lib/engine/session";
import type { Decision } from "@/lib/engine/types";
import { Icon, StatusChip, STATUS_VAR } from "./icons";

export function DecisionCard({
  decision: d,
  step,
  session,
  today,
  onClose,
  onSelect,
  onSwap,
  onVerify,
}: {
  decision: Decision | null;
  step: Step;
  session: Session;
  today: string;
  onClose: () => void;
  onSelect: (k: string) => void;
  onSwap: (challengerKey: string, displacedKey: string) => void;
  onVerify: (key: string, id: string) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (d) panel.current?.focus();
  }, [d?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const cf = useMemo(() => (d ? counterfactualSentence(step, d, today, step.policy) : ""), [d, step, today]);
  // policy sensitivity: thresholds nudged ±10%; skipped on very large files to keep the card instant
  const held = useMemo(() => (d && d.status !== "WITHDRAWN" && step.dataset.applications.length <= 250 ? heldPercent(step.dataset, step.policy, { today, pinned: {} }, d.key, d.status) : null), [d, step, today]);
  const app = d ? step.dataset.applications.find((a) => a.key === d.key) : null;
  const terr = d ? step.result.territories.find((t) => t.key === d.territoryKey) : null;
  const msg = useMemo(() => (d && app ? applicantMessage(d, { lang: app.language, city: app.city ?? terr?.city ?? null, today, policy: step.policy }) : null), [d, app, terr, today, step.policy]);
  const audit = d ? session.log.filter((l) => ("key" in l.update && l.update.key === d.key) || (l.update.kind === "swap" && (l.update.challenger === d.key || l.update.displaced === d.key)) || l.update.kind === "policy" || l.update.kind === "days" || (l.update.kind === "territory" && l.update.key === d.territoryKey)) : [];
  const [copied, setCopied] = useState(false);

  if (!d) return null;
  const displaced = d.contested ? step.result.decisions.find((x) => x.id === d.contested!.against) : null;
  const sentence = d.why;
  const [head, ...rest] = sentence.split(/:\s/);

  return (
    <aside
      ref={panel}
      tabIndex={-1}
      aria-label={`Decision for ${d.id}`}
      className="rise fixed inset-x-0 bottom-0 top-[53px] z-40 overflow-y-auto border-l border-line bg-surface scrollbar-thin md:left-auto md:w-[min(560px,46vw)] focus:outline-none"
      style={{ boxShadow: "var(--shadow)" }}
    >
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface/95 px-5 py-3 backdrop-blur-[2px]">
        <span className="num text-[15px] font-semibold">{d.id}</span>
        <span className="truncate text-[14px] text-ink-2">{d.name}</span>
        <span className="ml-auto"><StatusChip status={d.status} /></span>
        <button
          type="button"
          onClick={() => {
            document.body.classList.add("print-card");
            window.print();
            setTimeout(() => document.body.classList.remove("print-card"), 500);
          }}
          className="no-print grid size-8 place-items-center rounded-full hover:bg-surface-2"
          aria-label="Print this decision"
          title="Print or save as PDF"
        >
          <Icon.Download />
        </button>
        <button type="button" onClick={onClose} className="no-print grid size-8 place-items-center rounded-full hover:bg-surface-2" aria-label="Close decision"><Icon.Close /></button>
      </div>

      <div className="px-5 pb-28">
        {/* 1. Status and the one sentence */}
        <section className="pt-5">
          <p className="serif text-[22px] leading-snug">
            <span style={{ color: STATUS_VAR[d.status] }}>{head}:</span> {rest.join(": ")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-[12.5px]">
            {d.territoryId && <Tag icon={<Icon.Map size={13} />}>{d.territoryId} · {terr?.city}</Tag>}
            {(d.allocatedPin ?? d.pin) && <Tag icon={<Icon.Pin size={13} />}>pin {d.allocatedPin ?? d.pin}</Tag>}
            {d.pinned && <Tag icon={<Icon.Lock size={13} />}>approval locked</Tag>}
            {d.promoted && <Tag icon={<Icon.Spark size={13} />}>promoted from waitlist</Tag>}
            {d.flags.some((f) => f.code === "CLAIM_UNVERIFIED") && <Tag icon={<Icon.Clock size={13} />}>pending verification</Tag>}
          </div>
          <div className="mt-4 rounded-[var(--radius-m)] bg-surface-2 px-4 py-3">
            <div className="text-[12px] font-medium text-muted">Next step · {d.owner}</div>
            <div className="mt-0.5 text-[15px] font-medium leading-snug">{d.nextStep}</div>
            {d.asks.length > 1 && (
              <ul className="mt-2 space-y-1 text-[13px] text-ink-2">
                {d.asks.map((a, i) => (
                  <li key={i} className="flex gap-2"><span className="text-muted">{a.from}:</span> {a.what}</li>
                ))}
              </ul>
            )}
          </div>
          {d.contested && displaced && (
            <div className="mt-4 rounded-[var(--radius-m)] border-2 border-dashed px-4 py-3" style={{ borderColor: "var(--gold)" }}>
              <div className="flex items-center gap-2 text-[14px] font-semibold"><Icon.Swap /> Swap recommendation</div>
              <p className="mt-1 text-[13.5px] leading-snug text-ink-2">
                {d.id} now outranks approved partner {displaced.id} by {d.contested.gap} points. The approval stays unless a person confirms the swap; {displaced.id} would move to the waitlist with an alternative offered.
              </p>
              <button type="button" onClick={() => onSwap(d.key, displaced.key)} className="mt-2.5 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-semibold" style={{ background: "var(--gold)", color: "var(--on-gold)" }}>
                <Icon.Swap size={14} /> Confirm swap
              </button>
            </div>
          )}
          {d.handling && <p className="mt-3 text-[13px] text-ink-2">{d.handling}</p>}
        </section>

        {/* 2. Evidence */}
        <Section title="Evidence">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px]">
            {terr && (
              <>
                <Fact k="Territory">{terr.id}, {terr.city}, Tier {terr.tier}, {terr.priority} priority</Fact>
                <Fact k="Usable capacity">
                  <span className="num">{terr.effectiveCapacity}</span> = min({terr.slots} slots, {terr.freePins.length} free pins)
                </Fact>
                <Fact k="Pins without our store">{terr.freePins.length ? terr.freePins.map((p) => { const holder = step.result.decisions.find((x) => x.allocatedPin === p); return holder ? `${p} (${holder.id})` : `${p} open`; }).join(", ") : "none"}</Fact>
              </>
            )}
            {d.rank && <Fact k={d.status === "ON_HOLD" ? "Rank if fixed" : "Rank"}><span className="num">{d.rank.k} of {d.rank.n}</span></Fact>}
            {d.queuePos && <Fact k="Queue">#{d.queuePos}{d.ahead.length ? `, behind ${d.ahead.slice(0, 4).join(", ")}` : ""}</Fact>}
            {d.nearest && (
              <Fact k="Nearest store">
                {d.nearest.storeId} · {d.nearest.km !== null ? `${d.nearest.km} km` : `pin gap ${d.nearest.pinGap} (proxy)`} · opened {d.nearest.year} · {d.nearest.risk} overlap
              </Fact>
            )}
          </dl>
          {d.score && (
            <div className="mt-4">
              <div className="flex items-baseline justify-between text-[13px]">
                <span className="font-medium">Score {d.scoreProvisional ? "(provisional)" : ""}</span>
                <span className="num"><span className="text-[20px] font-semibold">{d.score.total}</span><span className="text-muted"> / 100 · bar {d.bar ?? "–"}</span></span>
              </div>
              <ul className="mt-2 space-y-1.5">
                {d.score.components.map((c) => (
                  <li key={c.key} className="grid grid-cols-[112px_1fr_52px] items-center gap-2 text-[12.5px]" title={c.note}>
                    <span className="text-ink-2">{c.label}</span>
                    <span className="relative h-2 rounded-full bg-surface-3" aria-hidden>
                      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(c.value / c.max) * 100}%`, background: "var(--ink-2)" }} />
                    </span>
                    <span className="num text-right text-muted">{c.value}/{c.max}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11.5px] text-muted">Names and language never enter the score.</p>
            </div>
          )}
          {d.capex && (
            <details className="mt-4 text-[13px]">
              <summary className="cursor-pointer font-medium">Funds check: ₹{d.capex.invest ?? "?"} lakh vs ₹{d.capex.required} lakh estimate {d.capex.ratio !== null && <span className="num text-muted">({Math.round(d.capex.ratio * 100)}%)</span>}</summary>
              <table className="mt-2 w-full text-[12.5px] num">
                <tbody>
                  <Row k={`Fit-out + opening stock (₹${d.capex.fitoutPerSqft}+₹${d.capex.stockPerSqft}/sq ft × ${d.capex.sizeUsed} sq ft${d.capex.sizeAssumed ? ", assumed" : ""})`} v={d.capex.fitoutStock} />
                  <Row k="Franchise fee" v={d.capex.franchiseFee} />
                  {d.capex.deposit > 0 && <Row k="Rent deposit (6 months)" v={d.capex.deposit} />}
                  {d.capex.runway > 0 && <Row k="Rent runway (3 months)" v={d.capex.runway} />}
                  <Row k="10% working-capital buffer" v={d.capex.buffer} />
                  <Row k="Estimate" v={d.capex.required} strong />
                </tbody>
              </table>
              <p className="mt-1 text-[11.5px] text-muted">Illustrative figures from the Policy panel; the rent index is a seeded table, not market data.</p>
            </details>
          )}
          {d.competitors.length > 0 && (
            <div className="mt-4">
              <div className="text-[12px] font-medium text-muted">Others in {d.territoryId}</div>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {d.competitors.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => onSelect(c.key)} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-[12px] hover:bg-surface-2">
                      <span className="num font-medium">{c.id}</span>
                      <span className="num text-muted">{c.score}</span>
                      {c.status && <span className="size-1.5 rounded-full" style={{ background: STATUS_VAR[c.status] }} aria-label={c.status} />}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {d.flags.length > 0 && (
            <ul className="mt-4 space-y-2">
              {d.flags.map((f, i) => (
                <li key={i} className="rounded-[var(--radius-s)] border border-line px-3 py-2 text-[12.5px]" title={f.code}>
                  <div className="font-medium">{CODE_LABEL[f.code]}</div>
                  <div className="text-ink-2">{f.text}{f.evidence ? <> · <q className="italic">{f.evidence}</q></> : null}</div>
                  {f.task && <div className="mt-0.5 text-muted">Check: {f.task} ({f.owner})</div>}
                  <div className="mt-0.5 text-[11px] text-muted">{f.provenance === "claimed" ? "Claimed in a follow-up, not yet verified" : f.provenance === "verified" ? "Verified" : "Declared in the file"}</div>
                  {f.code === "CLAIM_UNVERIFIED" && (
                    <button type="button" onClick={() => onVerify(d.key, d.id)} className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-0.5 text-[12px] hover:bg-surface-2"><Icon.Check size={13} /> Mark verified</button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {d.detail.length > 0 && (
            <ul className="mt-4 space-y-1.5 text-[13px] leading-snug text-ink-2">
              {d.detail.map((x, i) => (
                <li key={i} className="flex gap-2"><span className="text-muted" aria-hidden>–</span><span>{x}</span></li>
              ))}
            </ul>
          )}
        </Section>

        {/* 3. Confidence and 4. what would change */}
        <Section title="Confidence">
          {d.stability ? (
            <p className="text-[13.5px]"><span className="font-semibold">{d.stability.label === "robust" ? "Robust." : "Borderline."}</span> {d.stability.flip}</p>
          ) : (
            <p className="text-[13.5px] text-muted">Not applicable.</p>
          )}
          {held && (
            <p className="mt-1.5 text-[13px] text-ink-2">Held in <span className="num font-semibold">{held.pct}%</span> of {held.variants} policy variations (each main threshold nudged ±10%).</p>
          )}
          <h4 className="mt-3 text-[12px] font-medium text-muted">What would change this decision</h4>
          <p className="mt-0.5 text-[13.5px]">{cf}</p>
        </Section>

        {/* 5. If moving forward */}
        {d.plan && (
          <Section title="Onboarding plan">
            <Gantt plan={d.plan} />
            <div className="mt-4 grid gap-3 text-[13px] sm:grid-cols-2">
              <Box title="Training">
                {d.plan.training.track}, {d.plan.training.weeks} week{d.plan.training.weeks === 1 ? "" : "s"}, in {d.plan.training.language}. {d.plan.training.mode}. Buddy store {d.plan.training.buddyStore ?? "to be assigned"}: {d.plan.training.buddyReason}. Competency sign-off before go-live.
              </Box>
              <Box title="First stock and replenishment">
                {d.plan.supply.hub}. {d.plan.supply.note}. Route: {d.plan.supply.cluster}.
              </Box>
              <Box title="Indicative payback (illustrative)">
                {d.plan.payback.months !== null ? <><span className="num font-semibold">{d.plan.payback.months}</span> months</> : "not reached"}{d.plan.payback.flagged ? " · flagged: above 36 months, review the format" : ""}. Net ₹{d.plan.payback.monthlyNet} lakh a month on ₹{d.plan.payback.revenue} lakh revenue.
              </Box>
              <Box title="Documents to collect">
                <ul className="list-disc pl-4">
                  {d.plan.documents.map((x) => <li key={x}>{x}</li>)}
                </ul>
              </Box>
            </div>
            <p className="mt-2 text-[11.5px] text-muted">No fee is collected before verification and a signed agreement.</p>
          </Section>
        )}

        {/* 6. Applicant message */}
        {msg && (
          <Section title={`Message to applicant · ${msg.lang}`}>
            <p className={`whitespace-pre-wrap rounded-[var(--radius-m)] bg-surface-2 px-4 py-3 text-[14px] leading-relaxed ${msg.lang !== "English" ? "indic" : ""}`} lang={msg.lang === "Hindi" ? "hi" : msg.lang === "Kannada" ? "kn" : "en"}>
              {msg.text}
            </p>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(msg.text);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                } catch {
                  /* clipboard may be blocked; the text stays selectable */
                }
              }}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[12.5px] hover:bg-surface-2"
            >
              {copied ? <Icon.Check size={14} /> : <Icon.Copy size={14} />} {copied ? "Copied" : "Copy message"}
            </button>
          </Section>
        )}

        {/* 7. Audit trail */}
        <Section title="Audit trail">
          <ul className="space-y-1.5 text-[12.5px]">
            <li className="flex gap-2"><span className="num text-muted w-[92px] shrink-0">upload</span><span>Decided from the file (run {step.result.runId}, policy {step.result.policyVersion}).</span></li>
            {audit.map((l, i) => (
              <li key={i} className="flex gap-2"><span className="num text-muted w-[92px] shrink-0">{new Date(l.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><span>{l.update.text}</span></li>
            ))}
          </ul>
          {d.codes.length > 0 && <p className="mt-2 text-[11px] text-muted num" title="Internal reason codes">Codes: {d.codes.join(" · ")}</p>}
        </Section>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 border-t border-line pt-4">
      <h3 className="mb-2.5 text-[13px] font-semibold text-ink-2">{title}</h3>
      {children}
    </section>
  );
}
function Tag({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-ink-2">{icon}{children}</span>;
}
function Fact({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11.5px] text-muted">{k}</dt>
      <dd className="mt-0.5 leading-snug">{children}</dd>
    </div>
  );
}
function Row({ k, v, strong }: { k: string; v: number; strong?: boolean }) {
  return (
    <tr className={strong ? "border-t border-line font-semibold" : ""}>
      <td className="py-0.5 pr-2 text-ink-2 font-sans">{k}</td>
      <td className="py-0.5 text-right whitespace-nowrap">₹{v} lakh</td>
    </tr>
  );
}
function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-m)] border border-line px-3 py-2.5">
      <div className="text-[12px] font-medium text-muted">{title}</div>
      <div className="mt-1 leading-snug">{children}</div>
    </div>
  );
}

const OWNER_COLOR: Record<string, string> = { Legal: "var(--wait)", Applicant: "var(--hold)", Field: "var(--conditional)", Expansion: "var(--gold)", Training: "var(--approved)", "Supply chain": "var(--ink-2)" };

function Gantt({ plan }: { plan: NonNullable<Decision["plan"]> }) {
  const total = Math.max(plan.totalWeeks + 1, ...plan.steps.map((s) => s.week + s.weeks - 1));
  const targetW = plan.targetDate ? Math.round((new Date(plan.targetDate).getTime() - new Date(plan.readyDate).getTime()) / (7 * 864e5)) + plan.totalWeeks : null;
  const span = Math.max(total, targetW ?? 0) + 1;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[13px]">
        <span><span className="num font-semibold">{plan.totalWeeks}</span> weeks to open · ready {fmtDate(plan.readyDate)}</span>
        {plan.targetDate && <span className={plan.feasible ? "text-approved" : "text-hold"}>{plan.feasible ? "meets" : "misses"} target {fmtDate(plan.targetDate)}</span>}
      </div>
      <div className="relative mt-3 space-y-1.5" role="list" aria-label="Week-by-week plan">
        {targetW !== null && targetW > 0 && targetW <= span && (
          <div className="pointer-events-none absolute inset-y-0 border-l-2 border-dashed" style={{ left: `calc(132px + (100% - 132px) * ${targetW / span})`, borderColor: plan.feasible ? "var(--approved)" : "var(--hold)" }} aria-hidden>
            <span className="absolute -top-4 -translate-x-1/2 text-[10.5px] text-muted whitespace-nowrap">target</span>
          </div>
        )}
        {plan.steps.map((s, i) => (
          <div key={i} role="listitem" className="grid grid-cols-[132px_1fr] items-center gap-0 text-[12px]">
            <span className="truncate pr-2 text-ink-2" title={`${s.label} (${s.owner})`}>
              <span className="num text-muted">W{s.week}</span> {s.owner}
            </span>
            <span className="relative h-5">
              <span
                className="absolute inset-y-0 flex items-center overflow-hidden rounded-[4px] px-1.5 text-[11px] whitespace-nowrap"
                style={{ left: `${((s.week - 1) / span) * 100}%`, width: `${(s.weeks / span) * 100}%`, minWidth: 8, background: `color-mix(in srgb, ${OWNER_COLOR[s.owner] ?? "var(--ink-2)"} 22%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${OWNER_COLOR[s.owner] ?? "var(--ink-2)"} 55%, transparent)` }}
                title={s.label}
              >
                {s.label}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
