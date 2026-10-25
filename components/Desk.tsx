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
import type { Dataset, Decision, RunResult, Status } from "@/lib/engine/types";
import { Icon } from "./icons";
import { EmptyState } from "./EmptyState";
import { Explore } from "./Explore";
import { ResultsTable } from "./ResultsTable";
import { DecisionCard } from "./DecisionCard";
import { AskDesk, type Turn } from "./AskDesk";
import { Drawer, PolicyPanel, MethodPanel, DataNotesPanel } from "./Panels";
import { SelfTestPanel, TowerPanel } from "./TowerPanels";
import { HudStats } from "./hud/HudStats";
import { Sidebar } from "./hud/Sidebar";
import { buildTerrainData, territoryPoints } from "@/lib/map/terrain";
import { centroid } from "@/lib/engine/geo";
import { RequestsPanel, LocationPanel, territoryRequests } from "./map/TerritoryPanels";
import { territoryOverlay } from "@/lib/map/pinAreas";
import { PinLegend } from "./map/PinLegend";
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
  // Explore (the map experience) is the default; Summary holds the counts, list, ledger and the desk
  const [tab, setTab] = useState<"explore" | "summary">("explore");
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
      setTab("explore");
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

  const [openRequest, setOpenRequest] = useState<string | null>(null);
  const onSample = useCallback(async (open?: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/sample/sample-golden.xlsx");
      if (!r.ok) throw new Error("sample missing");
      loadBuffer(await r.arrayBuffer(), "SAMPLE DATA (invented test fixture)", "sample");
      setOpenRequest(open ?? null);
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
      <header className="sticky top-0 z-30 border-b border-line bg-[#0a0a10]">
        <div className="mx-auto flex max-w-[1800px] items-center gap-3 px-4 py-2">
          <a href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Franchise Desk home">
            <span className="grid size-8 place-items-center rounded-md" style={{ background: "var(--neon)", color: "var(--on-neon)" }} aria-hidden>
              <Icon.Store size={16} />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-[15px] font-semibold text-ink">Franchise Desk</span>
              <span className="text-[11.5px] text-muted">Partner review · expansion team</span>
            </span>
          </a>
          {result && (
            <div className="ml-2 flex shrink-0 rounded-full border border-white/10 bg-white/[0.03] p-0.5" role="tablist" aria-label="View">
              {(["explore", "summary"] as const).map((k) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-full px-3.5 py-1 text-[13px] font-semibold transition-colors ${tab === k ? "neon-btn" : "text-ink-2 hover:text-ink"}`}>
                  {k === "explore" ? "Explore" : "Summary"}
                </button>
              ))}
            </div>
          )}
          {result && dataset && tab === "summary" && (
            <div className="num ml-3 hidden min-w-0 items-center gap-2 whitespace-nowrap text-[12px] text-muted md:flex">
              {dataset.source !== "sample" && <span className="max-w-[22ch] truncate" title={dataset.fileName}>{dataset.fileName}</span>}
              <span title="Run ID: a hash of the input, policy and date">Run {result.runId}</span>
              <span aria-hidden>·</span>
              <span>Policy {result.policyVersion}</span>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1.5" title={ai === "on" ? "Questions are parsed by rules first; the model only helps with phrasing the rules do not understand. It never decides." : "Model unavailable or not configured: every answer comes from the rule-based parser."}>
                <i className="inline-block size-1.5 rounded-full" style={{ background: ai === "on" ? "var(--approved)" : "var(--muted)", boxShadow: ai === "on" ? "0 0 8px var(--approved)" : undefined }} />
                {ai === "on" ? "AI available" : "Rule-based"}
              </span>
            </div>
          )}
          <nav className="ml-auto flex min-w-0 items-center gap-1 overflow-x-auto scrollbar-thin" aria-label="Tools">
            {result && tab === "explore" && <HeaderButton onClick={() => { setChat(null); setTurns([]); }} icon={<Icon.Upload />} label="New file" />}
            {result && tab === "summary" && (
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
        <EmptyState onFile={onFile} onSample={() => onSample()} error={error} loading={loading} />
      ) : tab === "explore" ? (
        <Explore
          result={result}
          onSummary={() => setTab("summary")}
          onFullDecision={(k) => {
            setTab("summary");
            setSelected(k);
          }}
        />
      ) : (
        <main className="grid flex-1 grid-cols-1 lg:flex-none lg:h-[calc(100dvh-53px)] lg:grid-cols-[400px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
          <div className="order-2 h-[70vh] min-h-0 lg:order-1 lg:h-full lg:overflow-hidden">
            <Sidebar
              result={result}
              selected={selected}
              highlight={highlight}
              terrFilter={terrFilter}
              statusFilter={statusFilter}
              onStatus={setStatusFilter}
              onPickTerritory={setTerrFilter}
              onSelect={setSelected}
              onLedger={() => setPanel("ledger")}
            />
          </div>
          <section className="order-1 flex min-h-0 min-w-0 flex-col lg:order-2">
            <HudStats result={result} dataset={dataset} statusFilter={statusFilter} onStatus={setStatusFilter} onNotes={() => setPanel("notes")} />
            {error && <p role="alert" className="px-4 py-2 text-[13px] text-declined">{error}</p>}
            <WorldMap result={result} selected={selected} highlight={highlight} onSelect={setSelected} activeTerritory={terrFilter} onPickTerritory={setTerrFilter} openRequest={openRequest} onOpenedRequest={() => setOpenRequest(null)} />
          </section>
          {notice && (
            <div className="rise fixed bottom-[96px] left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] shadow-xl lg:left-[calc(50%+200px)]" role="status">
              <Icon.Spark className="text-neon" />
              <span>{notice}</span>
              <button className="ml-2 text-muted hover:text-ink" onClick={() => setNotice(null)} aria-label="Dismiss notice"><Icon.Close size={14} /></button>
            </div>
          )}
        </main>
      )}

      {result && dataset && steps && chat && tab === "summary" && (
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
function WorldMap({ result, selected, highlight, onSelect, activeTerritory, onPickTerritory, openRequest, onOpenedRequest }: { result: RunResult; selected: string | null; highlight: string[]; onSelect: (k: string) => void; activeTerritory: string | null; onPickTerritory: (k: string | null) => void; openRequest: string | null; onOpenedRequest: () => void }) {
  // India in 3D with territory names. Click a territory: fly into it with its requests and pin areas.
  // Click a request: fly to its pin with its area, service ring, nearby stores, rivals and the satellite view.
  const [mode, setMode] = useState<"overview" | "explore">("overview");
  const [focus, setFocus] = useState<{ at: [number, number]; zoom: number } | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [request, setRequest] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // no WebGL: stay on the flat map; panels, coordinates and the satellite view still work
  const [flat, setFlat] = useState(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  const points = useMemo(() => territoryPoints(result), [result]);
  const list = useMemo(() => (openKey ? territoryRequests(result, openKey) : []), [result, openKey]);
  const requestDecision = request ? result.decisions.find((d) => d.key === request) ?? null : null;
  const overlay = useMemo(() => (openKey || requestDecision ? territoryOverlay(result, openKey && !openKey.startsWith("city:") ? openKey : requestDecision?.territoryKey ?? null, requestDecision) : null), [result, openKey, requestDecision]);

  const flyToTerritory = (key: string) => {
    const p = points.find((x) => x.key === key);
    if (!p) return;
    setFocus({ at: p.lngLat, zoom: 12 });
    if (!flat) setMode("explore");
  };
  const openTerritory = (key: string | null) => {
    setOpenKey(key);
    setRequest(null);
    if (key) flyToTerritory(key);
    if (!key?.startsWith("city:")) onPickTerritory(key);
  };
  const deepDive = (d: Decision) => {
    const c = centroid(d.allocatedPin ?? d.pin);
    setRequest(d.key);
    if (c) {
      setFocus({ at: [c.lon, c.lat], zoom: 14.2 });
      if (!flat) setMode("explore");
    }
  };
  // picking a territory in the sidebar does the same as clicking its tag
  useEffect(() => {
    if (activeTerritory && activeTerritory !== openKey) {
      setOpenKey(activeTerritory);
      setRequest(null);
      flyToTerritory(activeTerritory);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTerritory]);
  // a request picked on the first page opens straight at its location
  useEffect(() => {
    if (!openRequest) return;
    const d = result.decisions.find((x) => x.key === openRequest);
    if (d) {
      setOpenKey(d.territoryKey ?? points.find((p) => p.muted && territoryRequests(result, p.key).some((x) => x.key === d.key))?.key ?? null);
      deepDive(d);
    }
    onOpenedRequest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest]);
  const step = (dir: 1 | -1) => {
    if (!requestDecision || !list.length) return;
    const i = list.findIndex((d) => d.key === requestDecision.key);
    deepDive(list[(i + dir + list.length) % list.length]);
  };
  const backToIndia = () => {
    setMode("overview");
    setRequest(null);
    setOpenKey(null);
    onPickTerritory(null);
  };
  return (
    <div className="relative h-[60vh] w-full min-h-[380px] lg:h-auto lg:flex-1" aria-label="Map of India with territories, stores and applications" style={{ background: "radial-gradient(90% 70% at 55% 35%, #191a2b 0%, #07070b 70%)" }}>
      {flat ? (
        <FlatIndia points={points} activeKey={openKey} onPick={(key) => openTerritory(key)} />
      ) : mode === "overview" ? (
        <Diorama
          points={points}
          activeKey={openKey}
          reducedMotion={reduced}
          autoRotate
          onFail={(r) => {
            console.warn("3D view unavailable, showing the flat map:", r);
            setFlat(true);
          }}
          onPick={(key) => openTerritory(key)}
        />
      ) : (
        <>
          {!failed && <TerrainMap result={result} selected={selected} highlight={[...highlight, ...(request ? [request] : list.map((d) => d.key))]} onSelect={onSelect} theme="dark" reducedMotion={reduced} onFail={(r) => setFailed(r)} activeTerritory={activeTerritory} onPickTerritory={(k) => openTerritory(k)} focus={focus?.at ?? null} focusZoom={focus?.zoom} overlay={overlay} />}
          <div className="world-vignette pointer-events-none absolute inset-0" aria-hidden />
          <button type="button" onClick={backToIndia} className="absolute left-3 top-3 z-[3] inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-[#101019]/90 px-3.5 py-1.5 text-[12.5px] font-medium text-white shadow-lg hover:border-neon">
            <span aria-hidden>←</span> Back to India
          </button>
          {failed && <p className="absolute bottom-24 left-1/2 -translate-x-1/2 text-[12px] text-muted">Map unavailable ({failed}). Every decision is in the list.</p>}
        </>
      )}
      {(flat || mode === "overview") && !openKey && <PinLegend points={points} corner="right" />}
      {requestDecision ? (
        <LocationPanel
          result={result}
          decision={requestDecision}
          index={Math.max(0, list.findIndex((d) => d.key === requestDecision.key))}
          total={list.length || 1}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onBack={() => {
            setRequest(null);
            if (openKey) flyToTerritory(openKey);
          }}
          onViewDecision={() => onSelect(requestDecision.key)}
        />
      ) : (
        openKey && (
          <RequestsPanel
            result={result}
            territoryKey={openKey}
            onOpenRequest={deepDive}
            onExplore={() => flyToTerritory(openKey)}
            onClose={() => {
              setOpenKey(null);
              onPickTerritory(null);
            }}
          />
        )
      )}
    </div>
  );
}

const FlatIndia = dynamic(() => import("./map/FlatIndia"), { ssr: false });
const Diorama = dynamic(() => import("./map/Diorama"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-[13px] text-muted">Building the 3D view of India…</div>,
});

function HeaderButton({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} title={label} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink">
      {icon}
      <span className="hidden 2xl:inline">{label}</span>
      <span className="sr-only 2xl:hidden">{label}</span>
    </button>
  );
}
