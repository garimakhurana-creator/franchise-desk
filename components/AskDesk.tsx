"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import { changeLine, type Block, type Reply } from "@/lib/chat/respond";
import type { RunResult } from "@/lib/engine/types";
import { Icon, StatusGlyph } from "./icons";

export type Turn = { role: "you"; text: string } | { role: "desk"; reply: Reply; mode: Reply["mode"] };

function suggestions(r: RunResult): string[] {
  const out: string[] = [];
  const hold = r.decisions.find((d) => d.status === "ON_HOLD");
  if (hold) out.push(`Why is ${hold.id} on hold?`);
  const wait = r.decisions.find((d) => d.status === "WAITLISTED");
  const appr = r.decisions.find((d) => d.status === "APPROVED");
  if (wait && appr && wait.territoryKey === appr.territoryKey) out.push(`Why did ${appr.id} beat ${wait.id}?`);
  const sized = r.decisions.find((d) => d.codes[0] === "SPACE_SIZE_MISSING");
  if (sized) out.push(`${sized.id} owned space is 480 sq ft on the ground floor`);
  const t = r.territories.find((x) => x.waitlisted.length);
  if (t) out.push(`Who is next in line for ${t.id}?`);
  out.push("Which territories have unfilled slots?");
  if (appr) out.push(`${appr.id} has withdrawn`);
  out.push("What if the approval bar were 60?");
  return out.slice(0, 6);
}

export const AskDesk = forwardRef<HTMLInputElement, { turns: Turn[]; busy: boolean; onSend: (m: string) => void; onSelect: (k: string) => void; onSwap: (c: string, d: string) => void; shifted: boolean; result: RunResult; pending: boolean }>(function AskDesk({ turns, busy, onSend, onSelect, onSwap, shifted, result, pending }, ref) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (turns.length) setOpen(true);
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [turns.length]);

  const submit = (m: string) => {
    if (!m.trim() || busy) return;
    onSend(m);
    setText("");
  };
  const chips = suggestions(result);

  return (
    <div className={`no-print fixed bottom-0 left-0 z-30 transition-[right] duration-300 ${shifted ? "right-0 md:right-[min(560px,46vw)]" : "right-0"}`}>
      <div className="mx-auto max-w-[920px] px-3 pb-3">
        <div className="rounded-[var(--radius-l)] border border-line bg-surface" style={{ boxShadow: "0 -8px 32px -18px #0007, var(--shadow)" }}>
          {open && turns.length > 0 && (
            <div ref={log} className="max-h-[42vh] overflow-y-auto px-4 pt-3 scrollbar-thin" aria-live="polite" aria-label="Conversation with the desk">
              {turns.map((t, i) =>
                t.role === "you" ? (
                  <p key={i} className="mb-2 ml-auto w-fit max-w-[85%] rounded-[14px] rounded-br-[4px] bg-surface-3 px-3 py-1.5 text-[14px]">{t.text}</p>
                ) : (
                  <div key={i} data-testid="desk-reply" data-mode={t.mode} className="mb-3 max-w-[96%] text-[14px] leading-relaxed">
                    <div className="mb-1 text-[11px] font-medium text-muted">{t.mode}</div>
                    {t.reply.blocks.map((b, j) => (
                      <BlockView key={j} b={b} onSelect={onSelect} onSwap={onSwap} result={result} />
                    ))}
                  </div>
                ),
              )}
              {busy && <p className="mb-3 text-[13px] text-muted">Working it out…</p>}
            </div>
          )}
          {!turns.length && (
            <div className="flex gap-1.5 overflow-x-auto px-3 pt-3 scrollbar-thin">
              {chips.map((c) => (
                <button key={c} type="button" onClick={() => submit(c)} className="shrink-0 rounded-full border border-line px-3 py-1 text-[12.5px] text-ink-2 hover:bg-surface-2 hover:text-ink">
                  {c}
                </button>
              ))}
            </div>
          )}
          <form
            className="flex items-center gap-2 p-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              submit(text);
            }}
          >
            <label htmlFor="ask" className="sr-only">Ask the desk</label>
            <input
              ref={ref}
              id="ask"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={pending ? 'What-if ready: say "apply" to commit, or ask something else' : "Ask the desk: “Why is APP-007 on hold?” or give news: “APP-012 found a ground-floor space”"}
              className="min-w-0 flex-1 bg-transparent px-2 py-2 text-[15px] placeholder:text-muted focus:outline-none"
              autoComplete="off"
              maxLength={600}
            />
            {turns.length > 0 && (
              <button type="button" onClick={() => setOpen((o) => !o)} className="hidden sm:inline rounded-full px-2.5 py-1.5 text-[12px] text-muted hover:bg-surface-2" aria-expanded={open}>
                {open ? "Hide" : "Show"} replies
              </button>
            )}
            <kbd className="hidden md:inline rounded border border-line px-1.5 text-[11px] text-muted" title="Press / to focus">/</kbd>
            <button type="submit" disabled={busy || !text.trim()} className="grid size-10 place-items-center rounded-full disabled:opacity-40" style={{ background: "var(--gold)", color: "var(--on-gold)" }} aria-label="Send">
              <Icon.Send />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
});

function linkIds(text: string, result: RunResult, onSelect: (k: string) => void) {
  const parts = text.split(/(\b[A-Z]{2,4}-\d{1,5}\b)/g);
  return parts.map((p, i) => {
    const d = result.decisions.find((x) => x.id === p);
    if (d)
      return (
        <button key={i} type="button" onClick={() => onSelect(d.key)} className="num font-semibold underline decoration-dotted underline-offset-2 hover:text-gold">
          {p}
        </button>
      );
    return <span key={i}>{p}</span>;
  });
}

function BlockView({ b, onSelect, onSwap, result }: { b: Block; onSelect: (k: string) => void; onSwap: (c: string, d: string) => void; result: RunResult }) {
  if (b.kind === "text") return <p className={b.text.startsWith("•") ? "pl-3 text-ink-2" : "mb-1"}>{linkIds(b.text, result, onSelect)}</p>;
  if (b.kind === "apply") return <p className="mt-1 text-[13px] text-muted">{b.label}</p>;
  if (b.kind === "swap")
    return (
      <div className="my-2 flex flex-wrap items-center gap-3 rounded-[var(--radius-m)] border-2 border-dashed px-3 py-2" style={{ borderColor: "var(--gold)" }}>
        <Icon.Swap />
        <span className="text-[13.5px]">
          Approve <b>{b.challenger}</b>, move <b>{b.displaced}</b> to the waitlist ({b.challenger} leads by {b.gap} points).
        </span>
        {b.simulated ? (
          <span className="text-[12px] text-muted">Apply the what-if first, then confirm.</span>
        ) : (
          <button type="button" onClick={() => onSwap(b.challengerKey, b.displacedKey)} className="rounded-full px-3 py-1 text-[13px] font-semibold" style={{ background: "var(--gold)", color: "var(--on-gold)" }}>
            Confirm swap
          </button>
        )}
      </div>
    );
  return (
    <div className="my-2 rounded-[var(--radius-m)] bg-surface-2 px-3 py-2">
      <div className="text-[12px] font-medium text-muted">{b.title}</div>
      <ul className="mt-1 space-y-0.5 text-[13px]">
        {b.changes.map((c) => (
          <li key={c.key} className="flex items-center gap-2">
            <StatusGlyph status={c.before.status} size={12} />
            <span aria-hidden className="text-muted">→</span>
            <StatusGlyph status={c.after.status} size={12} />
            <span className="num">{linkIds(changeLine(c), result, onSelect)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
