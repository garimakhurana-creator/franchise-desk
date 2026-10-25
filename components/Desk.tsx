"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { DEFAULT_POLICY } from "@/lib/engine/policy";
import { newSession, replay, effectivePolicy, type Update } from "@/lib/engine/session";
import { parseWorkbook, ParseError } from "@/lib/parse/parse";
import { readWorkbook, MAX_FILE_BYTES } from "@/lib/parse/xlsx";
import { parseRules } from "@/lib/chat/rules";
import { respond, replyText, type ChatState, type Reply } from "@/lib/chat/respond";
import { ParsedSchema, type Parsed } from "@/lib/chat/commands";
import type { Dataset, RunResult, Status } from "@/lib/engine/types";
import { Icon } from "./icons";
import { EmptyState } from "./EmptyState";
import { ResultsTable } from "./ResultsTable";
import { DecisionCard } from "./DecisionCard";
import { AskDesk, type Turn } from "./AskDesk";
import { Drawer, PolicyPanel, MethodPanel, DataNotesPanel } from "./Panels";
import { SelfTestPanel, TowerPanel } from "./TowerPanels";
import { HudStats } from "./hud/HudStats";
import { MissionPanel } from "./hud/MissionPanel";
import { Roster } from "./hud/Roster";
import { selfTest } from "@/lib/engine/selftest";
import { controlTower } from "@/lib/engine/tower";

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

type PanelName = "policy" | "method" | "notes" | "selftest" | "tower" | "ledger" | null;

export default function Desk() {
  const [chat, setChat] = useState<ChatState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState<"unknown" | "on" | "off">("unknown");
  const [panel, setPanel] = useState<PanelName>(null);
  const [terrFilter, setTerrFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<Status[]>([]);
  const [highlight, setHighlight] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const askRef = useRef<HTMLInputElement>(null);
  const today = useMemo(todayIso, []);

  // ---------- health: is the model path available? (never blocks anything) ----------
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    fetch("/api/health", { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setAi(j?.ai ? "on" : "off"))
      .catch(() => setAi("off"))
      .finally(() => clearTimeout(t));
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    document.body.dataset.ready = "1"; // interactive (used by acceptance tests)
  }, []);

  const steps = useMemo(() => (chat ? replay(chat.session) : null), [chat]);
  const step = steps?.at(-1) ?? null;
  const result = step?.result ?? null;
  const dataset = step?.dataset ?? null;
  const policy = chat ? effectivePolicy(chat.session) : DEFAULT_POLICY;

  const start = useCallback(
    (ds: Dataset) => {
      setChat({ session: newSession(ds, DEFAULT_POLICY, today), memory: { lastIds: [], lastTerritories: [] }, pending: null });
      setTurns([]);
      setSelected(null);
      setTerrFilter(null);
      setStatusFilter([]);
      setHighlight([]);
      setNotice(null);
      setError(null);
    },
    [today],
  );

  const loadBuffer = useCallback(
    (buf: ArrayBuffer, name: string, source: "upload" | "sample") => {
      try {
        const ds = parseWorkbook(readWorkbook(new Uint8Array(buf)), name, source);
        start(ds);
      } catch (e) {
        setError(e instanceof ParseError ? e.message : "This file could not be read as an Excel workbook. Save it as .xlsx and upload it again.");
      }
    },
    [start],
  );

  const onFile = useCallback(
    async (file: File) => {
      setError(null);
      if (file.size > MAX_FILE_BYTES) {
        setError(`This file is ${(file.size / 1e6).toFixed(1)} MB; the limit is ${MAX_FILE_BYTES / 1e6} MB. Remove unused sheets and try again.`);
        return;
      }
      if (!/\.(xlsx|xlsm|xls|csv)$/i.test(file.name)) {
        setError(`"${file.name}" is not an Excel file. Upload the .xlsx in the case template layout.`);
        return;
      }
      setLoading(true);
      try {
        loadBuffer(await file.arrayBuffer(), file.name, "upload");
      } finally {
        setLoading(false);
      }
    },
    [loadBuffer],
  );

  const onSample = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/sample/sample-golden.xlsx");
      if (!r.ok) throw new Error("sample missing");
      loadBuffer(await r.arrayBuffer(), "SAMPLE DATA (invented test fixture)", "sample");
    } catch {
      setError("The sample file could not be loaded. You can still upload your own file.");
    } finally {
      setLoading(false);
    }
  }, [loadBuffer]);

  // ---------- follow-up desk ----------
  const tryModel = useCallback(
    async (message: string, st: ChatState): Promise<Parsed | null> => {
      if (ai !== "on") return null;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6500);
      try {
        const ds = st.session.base;
        const r = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: ctrl.signal,
          body: JSON.stringify({
            message,
            ids: ds.applications.map((a) => a.id).slice(0, 600),
            territories: ds.territories.map((t) => t.id).slice(0, 100),
            lastIds: st.memory.lastIds,
            stateHash: `${result?.runId ?? ""}:${st.session.log.length}`,
          }),
        });
        if (!r.ok) return null;
        const j = await r.json();
        const parsed = ParsedSchema.safeParse(j.parsed);
        if (!parsed.success || !parsed.data.commands.length) return null;
        return parsed.data;
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
    [ai, result?.runId],
  );

  const send = useCallback(
    async (message: string) => {
      if (!chat || !message.trim()) return;
      const text = message.trim().slice(0, 600);
      setTurns((t) => [...t, { role: "you", text }]);
      setBusy(true);
      try {
        const rules = parseRules(text, chat.session.base, chat.memory);
        let parsed: Parsed = rules;
        let mode: Reply["mode"] = "Rule-based";
        let memory = rules.memory;
        // Rules first (fast, deterministic); the model only helps when the rules could not understand the message.
        const needsModel = rules.commands.every((c) => c.intent === "help");
        if (needsModel) {
          const m = await tryModel(text, chat);
          if (m) {
            parsed = m;
            mode = "AI-assisted";
            const ids = m.commands.flatMap((c) => ("ids" in c && c.ids ? c.ids : "id" in c ? [c.id] : [])).map((x) => x.toUpperCase());
            memory = { ...chat.memory, lastIds: [...new Set([...ids, ...chat.memory.lastIds])].slice(0, 6) };
          }
        }
        const at = new Date().toISOString();
        const { state, reply } = respond({ ...chat, memory }, parsed, at, mode);
        setChat({ ...state, memory });
        const lang = parsed.language === "Hindi" || parsed.language === "Kannada" ? parsed.language : null;
        const shown: Reply = lang && ai === "on" ? { ...reply, blocks: reply.blocks.filter((b) => !(b.kind === "text" && b.text.startsWith("(Rule-based mode answers"))) } : reply;
        const turnIndex = turns.length + 1;
        setTurns((t) => [...t, { role: "desk", reply: shown, mode }]);
        if (lang && ai === "on") {
          // Translate the finished answer; the server rejects any translation that changes a number or ID.
          const lines = replyText(shown).split(/\n/).filter(Boolean).slice(0, 30);
          fetch("/api/translate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lines, lang }), signal: AbortSignal.timeout(8000) })
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => setTurns((t) => t.map((x, i) => (i === turnIndex && x.role === "desk" ? { ...x, translated: j?.lines ? { lang, lines: j.lines } : { lang, lines: null } } : x))))
            .catch(() => setTurns((t) => t.map((x, i) => (i === turnIndex && x.role === "desk" ? { ...x, translated: { lang, lines: null } } : x))));
        }
        if (reply.focus.length) {
          setHighlight(reply.focus);
          if (reply.focus.length === 1) setSelected(reply.focus[0]);
        }
      } finally {
        setBusy(false);
      }
    },
    [chat, tryModel, ai, turns.length],
  );

  const pushUpdate = useCallback(
    (u: Update, label: string) => {
      if (!chat) return;
      const at = new Date().toISOString();
      const before = replay(chat.session).at(-1)!.result;
      const session = { ...chat.session, log: [...chat.session.log, { update: u, at }] };
      setChat({ ...chat, session, pending: null });
      const after = replay(session).at(-1)!.result;
      const moved = after.decisions.filter((d) => before.decisions.find((b) => b.key === d.key)?.status !== d.status).length;
      setNotice(`${label} ${moved} decision${moved === 1 ? "" : "s"} changed.`);
    },
    [chat],
  );

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /input|textarea|select/i.test(e.target.tagName);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        askRef.current?.focus();
      } else if (e.key === "Escape") {
        if (panel) setPanel(null);
        else if (selected) setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel, selected]);

  const selectedDecision = result?.decisions.find((d) => d.key === selected) ?? null;
  const modeBadge = ai === "on" ? "AI on standby" : "Rule-based";

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="hud sticky top-0 z-30 border-b border-line/70 bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1800px] items-center gap-3 px-4 py-2">
          <a href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Franchise Desk home">
            <span className="grid size-8 place-items-center" style={{ background: "var(--gold)", clipPath: "polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0 50%)", color: "var(--on-gold)" }} aria-hidden>
              <Icon.Store size={16} />
            </span>
            <span className="flex flex-col leading-none">
              <span className="hud-num text-[16px] tracking-[0.08em] text-ink">FRANCHISE DESK</span>
              <span className="hud-label mt-0.5 text-[9.5px]">Expansion command</span>
            </span>
          </a>
          {result && dataset && (
            <div className="hud-num ml-3 hidden min-w-0 items-center gap-2 whitespace-nowrap text-[11.5px] font-medium text-muted md:flex">
              {dataset.source !== "sample" && <span className="max-w-[22ch] truncate" title={dataset.fileName}>{dataset.fileName}</span>}
              <span title="Run ID: a hash of the input, policy and date">RUN {result.runId}</span>
              <span aria-hidden>·</span>
              <span>POLICY {result.policyVersion}</span>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1.5" title={ai === "on" ? "Questions are parsed by rules first; the model only helps with phrasing the rules do not understand. It never decides." : "Model unavailable or not configured: every answer comes from the rule-based parser."}>
                <i className="inline-block size-1.5 rounded-full" style={{ background: ai === "on" ? "var(--approved)" : "var(--muted)", boxShadow: ai === "on" ? "0 0 8px var(--approved)" : undefined }} />
                {ai === "on" ? "AI STANDBY" : "RULE-BASED"}
              </span>
            </div>
          )}
          <nav className="ml-auto flex min-w-0 items-center gap-1 overflow-x-auto scrollbar-thin" aria-label="Tools">
            {result && (
              <>
                <HeaderButton onClick={() => setPanel("tower")} icon={<Icon.Clock />} label="Control tower" />
                <HeaderButton onClick={() => setPanel("policy")} icon={<Icon.Sliders />} label="Policy" />
                <HeaderButton onClick={() => setPanel("method")} icon={<Icon.Book />} label="How it decides" />
                <HeaderButton onClick={() => setPanel("notes")} icon={<Icon.Notes />} label="Data notes" />
                <HeaderButton onClick={() => setPanel("selftest")} icon={<Icon.Shield />} label="Self-test" />
                <HeaderButton
                  onClick={async () => {
                    const { downloadExport } = await import("@/lib/export");
                    downloadExport(dataset!, result, chat!.session.log);
                  }}
                  icon={<Icon.Download />}
                  label="Export"
                />
                <HeaderButton onClick={() => { setChat(null); setTurns([]); }} icon={<Icon.Upload />} label="New file" />
              </>
            )}
            {!result && <HeaderButton onClick={() => setPanel("method")} icon={<Icon.Book />} label="How it decides" />}
          </nav>
        </div>
      </header>

      {!result || !dataset || !steps ? (
        <EmptyState onFile={onFile} onSample={onSample} error={error} loading={loading} />
      ) : (
        <main className="relative flex-1">
          {/* The world: India in relief behind every panel */}
          <WorldMap result={result} selected={selected} highlight={highlight} onSelect={setSelected} activeTerritory={terrFilter} onPickTerritory={setTerrFilter} />
          {/* The HUD */}
          <div className="pointer-events-none relative z-10 mx-auto flex max-w-[1800px] flex-col gap-3 px-3 pt-3 pb-40 lg:h-[calc(100dvh-53px)] lg:pb-[132px]">
            <div className="pointer-events-auto">
              <HudStats result={result} statusFilter={statusFilter} onStatus={setStatusFilter} sample={dataset.source === "sample"} />
              <div className="hud mt-1.5 flex flex-wrap items-center gap-x-3 px-1 text-[11.5px] font-medium text-muted">
                <span>
                  READ <span className="hud-num text-ink-2">{dataset.applications.length}</span> APPLICATIONS · <span className="hud-num text-ink-2">{dataset.territories.length}</span> TERRITORIES · <span className="hud-num text-ink-2">{dataset.rowsIgnored.length}</span> ROWS IGNORED
                </span>
                <button type="button" onClick={() => setPanel("notes")} className="underline decoration-dotted underline-offset-2 hover:text-ink">
                  {dataset.notes.filter((n) => n.severity !== "info").length} DATA ISSUES · {dataset.notes.filter((n) => n.severity === "info").length} NOTES
                </button>
                {error && <span role="alert" className="text-declined">{error}</span>}
              </div>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[300px_minmax(0,1fr)_minmax(380px,430px)]">
              <div className="pointer-events-auto min-h-0">
                <MissionPanel result={result} active={terrFilter} onPick={setTerrFilter} />
              </div>
              <div aria-hidden className="hidden lg:block" />
              <div className="pointer-events-auto min-h-0 lg:h-full">
                <Roster
                  decisions={result.decisions}
                  selected={selected}
                  highlight={highlight}
                  terrFilter={terrFilter}
                  statusFilter={statusFilter}
                  onStatus={setStatusFilter}
                  onClearTerritory={() => setTerrFilter(null)}
                  onSelect={setSelected}
                  onLedger={() => setPanel("ledger")}
                />
              </div>
            </div>
          </div>
          {notice && (
            <div className="hud rise pointer-events-auto fixed left-1/2 bottom-[150px] z-30 flex -translate-x-1/2 items-center gap-2 rounded-lg border px-3 py-2 text-[13px]" role="status" style={{ background: "var(--hud-bg)", borderColor: "var(--hud-edge)", boxShadow: "0 0 30px -10px var(--gold)" }}>
              <Icon.Spark className="text-gold" />
              <span>{notice}</span>
              <button className="ml-2 text-muted hover:text-ink" onClick={() => setNotice(null)} aria-label="Dismiss notice"><Icon.Close size={14} /></button>
            </div>
          )}
        </main>
      )}

      {result && dataset && steps && chat && (
        <>
          <DecisionCard
            decision={selectedDecision}
            step={step!}
            session={chat.session}
            today={today}
            onClose={() => setSelected(null)}
            onSelect={setSelected}
            onSwap={(challenger, displaced) => pushUpdate({ kind: "swap", challenger, displaced, text: `Confirmed swap: ${challenger} replaces ${displaced}` }, "Swap confirmed and logged.")}
            onVerify={(key, id) => pushUpdate({ kind: "verify", key, text: `${id} verified` }, `${id} marked verified.`)}
          />
          <AskDesk ref={askRef} turns={turns} busy={busy} onSend={send} onSelect={setSelected} onSwap={(c, d) => pushUpdate({ kind: "swap", challenger: c, displaced: d, text: `Confirmed swap: ${c} replaces ${d}` }, "Swap confirmed and logged.")} shifted={!!selectedDecision} result={result} pending={!!chat.pending} />
        </>
      )}

      <Drawer open={panel === "policy"} title="Policy" onClose={() => setPanel(null)}>
        <PolicyPanel
          policy={policy}
          onApply={(path, value, label) => {
            pushUpdate({ kind: "policy", path, value, text: `Policy: ${label} → ${value}` }, `Policy changed (${label} → ${value}). Every decision re-ran from the uploaded file with logged updates replayed.`);
          }}
          disabled={!chat}
        />
      </Drawer>
      <Drawer open={panel === "method"} title="How it decides" onClose={() => setPanel(null)}>
        <MethodPanel policy={policy} />
      </Drawer>
      <Drawer open={panel === "ledger"} title="Ledger: every application" onClose={() => setPanel(null)} wide>
        {result && (
          <ResultsTable
            decisions={result.decisions}
            selected={selected}
            highlight={highlight}
            terrFilter={terrFilter}
            statusFilter={statusFilter}
            onClearFilters={() => { setTerrFilter(null); setStatusFilter([]); }}
            onSelect={(k) => { setSelected(k); setPanel(null); }}
          />
        )}
      </Drawer>
      <Drawer open={panel === "selftest"} title="Integrity self-test" onClose={() => setPanel(null)}>
        {step && <SelfTestPanel run={() => selfTest(step.dataset, step.policy, { today, pinned: {} })} />}
      </Drawer>
      <Drawer open={panel === "tower"} title="Control tower" onClose={() => setPanel(null)}>
        {result && (
          <TowerPanel
            tower={controlTower(result, policy, today)}
            onSelect={(k) => {
              setSelected(k);
              setPanel(null);
            }}
            onSimulate={(days) => {
              pushUpdate({ kind: "days", days, text: `${days} days passed with no news` }, `Simulated ${days} days.`);
              setPanel(null);
            }}
          />
        )}
      </Drawer>
      <Drawer open={panel === "notes"} title="Data notes" onClose={() => setPanel(null)}>
        {dataset && <DataNotesPanel dataset={dataset} log={chat?.session.log ?? []} />}
      </Drawer>
    </div>
  );
}

const TerrainMap = dynamic(() => import("./map/TerrainMap"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-[13px] text-muted">Loading the map…</div>,
});

/** The world behind the HUD. Optional by design: any failure leaves a calm backdrop and the roster carries everything. */
function WorldMap({ result, selected, highlight, onSelect, activeTerritory, onPickTerritory }: { result: RunResult; selected: string | null; highlight: string[]; onSelect: (k: string) => void; activeTerritory: string | null; onPickTerritory: (k: string | null) => void }) {
  const [failed, setFailed] = useState<string | null>(null);
  const [reduced, setReduced] = useState(false);
  useEffect(() => setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  return (
    <div className="relative h-[52vh] w-full lg:fixed lg:inset-x-0 lg:bottom-0 lg:top-[53px] lg:h-auto" aria-label="Map of India with territories, stores and applications" style={{ background: "radial-gradient(90% 70% at 55% 35%, #1a2232 0%, #060a10 70%)" }}>
      {!failed && <TerrainMap result={result} selected={selected} highlight={highlight} onSelect={onSelect} theme="dark" reducedMotion={reduced} onFail={(r) => setFailed(r)} activeTerritory={activeTerritory} onPickTerritory={onPickTerritory} />}
      <div className="world-vignette pointer-events-none absolute inset-0" aria-hidden />
      {failed && <p className="hud absolute bottom-[150px] left-1/2 -translate-x-1/2 text-[12px] text-muted">Map unavailable ({failed}). Every decision is in the roster.</p>}
    </div>
  );
}

function HeaderButton({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} title={label} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink">
      {icon}
      <span className="hidden 2xl:inline">{label}</span>
      <span className="sr-only 2xl:hidden">{label}</span>
    </button>
  );
}
