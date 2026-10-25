// Session state: the uploaded dataset plus an ordered log of updates. Every state is
// recomputed by replaying the log on the original file, so undo and policy changes are exact.
import { run, compareIds } from "./decide";
import { normaliseId } from "./normalise";
import { setPolicyValue, type Policy } from "./policy";
import type { Application, Dataset, Decision, Floor, FactField, Lang, Priority, RunResult, SpaceKind, Status } from "./types";

export interface FactChanges {
  pin?: string;
  city?: string;
  invest?: number;
  experience?: number;
  space?: SpaceKind;
  size?: number | null;
  floor?: Floor | null;
  targetMonths?: number;
  language?: Lang;
}

export type Update =
  | { kind: "facts"; key: string; changes: FactChanges; text: string }
  | { kind: "withdraw"; key: string; text: string }
  | { kind: "territory"; key: string; slots?: number; addPins?: string[]; removePins?: string[]; priority?: Priority; text: string }
  | { kind: "swap"; challenger: string; displaced: string; text: string }
  | { kind: "verify"; key: string; text: string }
  | { kind: "policy"; path: string; value: number | string; text: string }
  | { kind: "days"; days: number; text: string };

export interface LogEntry {
  update: Update;
  at: string; // ISO timestamp supplied by the caller
}

export interface Session {
  base: Dataset;
  basePolicy: Policy;
  today: string;
  log: LogEntry[];
}

export interface Step {
  result: RunResult;
  pinned: Record<string, string>;
  dataset: Dataset;
  policy: Policy;
}

const statusRank: Record<Status, number> = { APPROVED: 5, CONDITIONAL: 4, WAITLISTED: 3, ON_HOLD: 2, DECLINED: 1, WITHDRAWN: 0 };
export const statusOrder = (s: Status) => statusRank[s];

export function newSession(base: Dataset, basePolicy: Policy, today: string): Session {
  return { base, basePolicy, today, log: [] };
}

export function effectivePolicy(s: Session, extra: Update[] = []): Policy {
  let p = s.basePolicy;
  for (const u of [...s.log.map((l) => l.update), ...extra]) if (u.kind === "policy") p = setPolicyValue(p, u.path, u.value);
  return p;
}

function cloneDataset(ds: Dataset): Dataset {
  return { ...ds, applications: ds.applications.map((a) => ({ ...a, provenance: { ...a.provenance }, fieldFlags: [...a.fieldFlags] })), territories: ds.territories.map((t) => ({ ...t, pins: [...t.pins] })) };
}

function applyData(ds: Dataset, u: Update): Dataset {
  if (u.kind === "facts") {
    const next = cloneDataset(ds);
    const a = next.applications.find((x) => x.key === u.key);
    if (!a) return ds;
    for (const [k, v] of Object.entries(u.changes) as [keyof FactChanges, unknown][]) {
      (a as unknown as Record<string, unknown>)[k] = v;
      a.provenance[k as FactField] = "claimed";
    }
    if (u.changes.space === "None") {
      if (!("size" in u.changes)) a.size = null;
      if (!("floor" in u.changes)) a.floor = null;
    }
    a.withdrawn = false;
    return next;
  }
  if (u.kind === "withdraw") {
    const next = cloneDataset(ds);
    const a = next.applications.find((x) => x.key === u.key);
    if (a) a.withdrawn = true;
    return next;
  }
  if (u.kind === "verify") {
    const next = cloneDataset(ds);
    const a = next.applications.find((x) => x.key === u.key);
    if (a) for (const k of Object.keys(a.provenance) as FactField[]) if (a.provenance[k] === "claimed") a.provenance[k] = "verified";
    return next;
  }
  if (u.kind === "territory") {
    const next = cloneDataset(ds);
    const t = next.territories.find((x) => x.key === u.key);
    if (!t) return ds;
    if (u.slots !== undefined) t.slots = u.slots;
    if (u.priority) t.priority = u.priority;
    if (u.addPins) for (const p of u.addPins) if (!t.pins.includes(p)) t.pins.push(p);
    if (u.removePins) t.pins = t.pins.filter((p) => !u.removePins!.includes(p));
    return next;
  }
  return ds;
}

/** Replay the log (plus optional extra updates) and return every step. Step 0 is the baseline. */
export function replay(s: Session, extra: Update[] = []): Step[] {
  const policy = effectivePolicy(s, extra);
  const updates = [...s.log.map((l) => l.update), ...extra];
  const steps: Step[] = [];
  let ds = s.base;
  let pinned: Record<string, string> = {};
  let swapNotes: Record<string, string> = {};
  let lapsed: string[] = [];
  let closed: string[] = [];
  let previous: Record<string, Status> | undefined;
  const exec = () => {
    const result = run(ds, policy, { today: s.today, pinned, swapNotes, lapsed, closedHolds: closed, previous });
    // Anyone approved is locked in from now on.
    const nextPinned: Record<string, string> = {};
    for (const d of result.decisions) if (d.status === "APPROVED" && d.allocatedPin) nextPinned[d.key] = d.allocatedPin;
    pinned = nextPinned;
    previous = Object.fromEntries(result.decisions.map((d) => [d.key, d.status]));
    steps.push({ result, pinned: { ...pinned }, dataset: ds, policy });
    return result;
  };
  let last = exec();
  for (const u of updates) {
    if (u.kind === "swap") {
      const pin = pinned[u.displaced];
      const ch = last.decisions.find((d) => d.key === u.challenger);
      const next = { ...pinned };
      delete next[u.displaced];
      if (ch?.pin) next[u.challenger] = ch.pin;
      pinned = next;
      const chId = ch?.id ?? u.challenger;
      swapNotes = { ...swapNotes, [u.displaced]: chId };
      void pin;
    } else if (u.kind === "days") {
      if (u.days >= 30) lapsed = [...new Set([...lapsed, ...last.decisions.filter((d) => d.status === "CONDITIONAL" && !d.ready && d.allocatedPin === null).map((d) => d.key)])];
      if (u.days >= 14) closed = [...new Set([...closed, ...last.decisions.filter((d) => d.status === "ON_HOLD").map((d) => d.key)])];
    } else if (u.kind !== "policy") {
      ds = applyData(ds, u);
      if (u.kind === "facts" || u.kind === "verify") {
        // fresh information re-opens a closed hold or lapsed reservation
        closed = closed.filter((k) => k !== u.key);
        lapsed = lapsed.filter((k) => k !== u.key);
      }
    }
    last = exec();
  }
  return steps;
}

export function current(s: Session): Step {
  const steps = replay(s);
  return steps[steps.length - 1];
}

export interface Change {
  key: string;
  id: string;
  before: { status: Status; score: number | null; rank: string | null; queue: number | null };
  after: { status: Status; score: number | null; rank: string | null; queue: number | null };
  direction: "up" | "down" | "same";
  why: string;
}

export function diff(before: RunResult, after: RunResult): Change[] {
  const out: Change[] = [];
  const b = new Map(before.decisions.map((d) => [d.key, d]));
  for (const a of [...after.decisions].sort((x, y) => compareIds(x.key, y.key))) {
    const p = b.get(a.key);
    if (!p) continue;
    const snap = (d: Decision) => ({ status: d.status, score: d.score?.total ?? null, rank: d.rank ? `${d.rank.k} of ${d.rank.n}` : null, queue: d.queuePos });
    const sb = snap(p);
    const sa = snap(a);
    if (sb.status === sa.status && sb.score === sa.score && sb.rank === sa.rank && sb.queue === sa.queue && p.why === a.why) continue;
    const dir = statusRank[sa.status] > statusRank[sb.status] ? "up" : statusRank[sa.status] < statusRank[sb.status] ? "down" : "same";
    out.push({ key: a.key, id: a.id, before: sb, after: sa, direction: dir, why: a.why });
  }
  return out;
}

export function findKey(ds: Dataset, raw: string): Application | undefined {
  const k = normaliseId(raw);
  return ds.applications.find((a) => a.key === k) ?? ds.applications.find((a) => a.key.split("#")[0] === k);
}
