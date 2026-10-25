"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_POLICY } from "@/lib/engine/policy";
import { newSession, replay, effectivePolicy, type Update } from "@/lib/engine/session";
import { parseWorkbook, ParseError } from "@/lib/parse/parse";
import { readWorkbook, MAX_FILE_BYTES } from "@/lib/parse/xlsx";
import { parseRules } from "@/lib/chat/rules";
import { respond, type ChatState, type Reply } from "@/lib/chat/respond";
import { ParsedSchema, type Parsed } from "@/lib/chat/commands";
import type { Dataset, Status } from "@/lib/engine/types";
import { Icon } from "./icons";
import { EmptyState } from "./EmptyState";
import { TerritoryRail } from "./TerritoryRail";
import { SummaryStrip } from "./Summary";
import { ResultsTable } from "./ResultsTable";
import { DecisionCard } from "./DecisionCard";
import { AskDesk, type Turn } from "./AskDesk";
import { Drawer, PolicyPanel, MethodPanel, DataNotesPanel } from "./Panels";

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

type PanelName = "policy" | "method" | "notes" | null;

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
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
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
    const t = document.documentElement.dataset.theme;
    setTheme(t === "light" || t === "dark" ? t : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }, []);
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("fd-theme", next);
    } catch {
      /* storage is optional */
    }
    setTheme(next);
  };

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
        // Prefer the model only when the rules could not understand the message, or it is not in English.
        const needsModel = rules.commands.every((c) => c.intent === "help") || (rules.language !== "English" && rules.language !== undefined);
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
        setTurns((t) => [...t, { role: "desk", reply, mode }]);
        if (reply.focus.length) {
          setHighlight(reply.focus);
          if (reply.focus.length === 1) setSelected(reply.focus[0]);
        }
      } finally {
        setBusy(false);
      }
    },
    [chat, tryModel],
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
  const modeBadge = ai === "on" ? "AI-assisted when needed" : "Rule-based";

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-[2px]">
        <div className="mx-auto flex max-w-[1680px] items-center gap-3 px-4 py-2.5">
          <a href="/" className="flex items-baseline gap-2 shrink-0" aria-label="Franchise Desk home">
            <span className="serif text-[22px] leading-none italic">Franchise</span>
            <span className="text-[15px] font-semibold tracking-tight">Desk</span>
          </a>
          {result && dataset && (
            <div className="hidden md:flex items-center gap-2 text-[12px] text-muted min-w-0">
              {dataset.source === "sample" && <span className="rounded px-1.5 py-0.5 font-semibold text-[11px]" style={{ background: "var(--gold-soft)", color: "var(--gold)" }}>SAMPLE DATA</span>}
              <span className="truncate max-w-[22ch]" title={dataset.fileName}>{dataset.fileName}</span>
              <span aria-hidden>·</span>
              <span className="num" title="Run ID: a hash of the input, policy and date">run {result.runId}</span>
              <span aria-hidden>·</span>
              <span className="num">policy {result.policyVersion}</span>
              <span aria-hidden>·</span>
              <span title={ai === "on" ? "Questions are parsed by rules first; the model only helps with phrasing the rules do not understand. It never decides." : "Model unavailable or not configured: every answer comes from the rule-based parser."}>{modeBadge}</span>
            </div>
          )}
          <nav className="ml-auto flex items-center gap-1" aria-label="Tools">
            {result && (
              <>
                <HeaderButton onClick={() => setPanel("policy")} icon={<Icon.Sliders />} label="Policy" />
                <HeaderButton onClick={() => setPanel("method")} icon={<Icon.Book />} label="How it decides" />
                <HeaderButton onClick={() => setPanel("notes")} icon={<Icon.Notes />} label="Data notes" />
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
            <button type="button" onClick={toggleTheme} className="ml-1 grid size-9 place-items-center rounded-full text-ink-2 hover:bg-surface-2" aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
              {theme === "dark" ? <Icon.Sun /> : <Icon.Moon />}
            </button>
          </nav>
        </div>
      </header>

      {!result || !dataset || !steps ? (
        <EmptyState onFile={onFile} onSample={onSample} error={error} loading={loading} />
      ) : (
        <main className="mx-auto w-full max-w-[1680px] flex-1 grid grid-cols-1 lg:grid-cols-[264px_minmax(0,1fr)] gap-0">
          <TerritoryRail result={result} active={terrFilter} onPick={(k) => setTerrFilter((cur) => (cur === k ? null : k))} />
          <section className="min-w-0 flex flex-col px-4 pb-40 lg:pb-36">
            {error && <p role="alert" className="mt-3 rounded-md border border-declined/40 px-3 py-2 text-sm text-declined">{error}</p>}
            <SummaryStrip dataset={dataset} result={result} statusFilter={statusFilter} onStatus={setStatusFilter} onNotes={() => setPanel("notes")} />
            {notice && (
              <div className="rise mt-2 flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2 text-[13px]" role="status">
                <Icon.Spark className="text-gold" />
                <span>{notice}</span>
                <button className="ml-auto text-muted hover:text-ink" onClick={() => setNotice(null)} aria-label="Dismiss notice"><Icon.Close size={14} /></button>
              </div>
            )}
            <ResultsTable
              decisions={result.decisions}
              selected={selected}
              highlight={highlight}
              terrFilter={terrFilter}
              statusFilter={statusFilter}
              onClearFilters={() => { setTerrFilter(null); setStatusFilter([]); }}
              onSelect={setSelected}
            />
          </section>
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
      <Drawer open={panel === "notes"} title="Data notes" onClose={() => setPanel(null)}>
        {dataset && <DataNotesPanel dataset={dataset} log={chat?.session.log ?? []} />}
      </Drawer>
    </div>
  );
}

function HeaderButton({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink">
      {icon}
      <span className="hidden xl:inline">{label}</span>
      <span className="sr-only xl:hidden">{label}</span>
    </button>
  );
}
