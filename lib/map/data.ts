// Turns engine output into map layer data. Pure: no map or React imports.
import { centroid } from "../engine/geo";
import reference from "../engine/reference.json";
import type { Decision, RunResult, Status } from "../engine/types";

export type RGBA = [number, number, number, number];

export interface Palette {
  bg: string;
  land: string;
  landEdge: string;
  state: string;
  focusFill: string;
  focusEdge: string;
  text: string;
  muted: string;
  gold: RGBA;
  store: RGBA;
  storeDisc: RGBA;
  status: Record<Status, RGBA>;
  arc: RGBA;
}

const hex = (h: string, a = 255): RGBA => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), a];

export const PALETTE: Record<"light" | "dark", Palette> = {
  dark: {
    bg: "#08131a",
    land: "#12262f",
    landEdge: "#2a4b59",
    state: "#1f3c48",
    focusFill: "#17313c",
    focusEdge: "#4d7b8c",
    text: "#efe9dd",
    muted: "#9fb1b8",
    gold: hex("#f2c14e"),
    store: hex("#8fa3ab"),
    storeDisc: hex("#9fb1b8", 26),
    status: { APPROVED: hex("#2fbf8f"), CONDITIONAL: hex("#4fc3d9"), ON_HOLD: hex("#e39a3b"), WAITLISTED: hex("#9aa6d3"), DECLINED: hex("#e2685f"), WITHDRAWN: hex("#8a989e") },
    arc: hex("#f2c14e", 230),
  },
  light: {
    bg: "#e6e1d4",
    land: "#f7f5ef",
    landEdge: "#b9b09c",
    state: "#ddd6c6",
    focusFill: "#fbfaf6",
    focusEdge: "#8f846c",
    text: "#16232a",
    muted: "#5a6a70",
    gold: hex("#b07d0c"),
    store: hex("#5f6d73"),
    storeDisc: hex("#5f6d73", 26),
    status: { APPROVED: hex("#17805d"), CONDITIONAL: hex("#16788f"), ON_HOLD: hex("#a35f0c"), WAITLISTED: hex("#52609a"), DECLINED: hex("#ad332b"), WITHDRAWN: hex("#5f6d73") },
    arc: hex("#9a6d0a", 230),
  },
};

export interface StoreDatum {
  id: string;
  pin: string;
  year: number | null;
  position: [number, number];
}

export interface StoneDatum {
  key: string;
  id: string;
  status: Status;
  why: string;
  pin: string;
  position: [number, number];
  order: number; // landing order: approved first
  locked: boolean;
  labelLeft: boolean; // centre stone of a shared pin labels to the left
}

export interface BlockDatum {
  territory: string;
  kind: "approved" | "conditional" | "open" | "ghost";
  level: number;
  position: [number, number, number];
}

export interface ArcDatum {
  from: [number, number];
  to: [number, number];
  label: string;
}

export interface TowerLabel {
  id: string;
  city: string;
  position: [number, number, number];
  text: string;
  anchor: "start" | "end";
}

const STATUS_ORDER: Record<Status, number> = { APPROVED: 0, CONDITIONAL: 1, WAITLISTED: 2, ON_HOLD: 3, DECLINED: 4, WITHDRAWN: 5 };

export const BLOCK_H = 2200; // metres per slot block
export const BLOCK_GAP = 1000;

function pos(pin: string | null): [number, number] | null {
  const c = centroid(pin);
  return c ? [c.lon, c.lat] : null;
}

export function buildMapData(result: RunResult) {
  // Existing stores: the fixed list, plus any store pin the territories report.
  const stores = new Map<string, StoreDatum>();
  for (const s of reference.stores) {
    const p = pos(s.pin);
    if (p) stores.set(s.pin, { id: s.id, pin: s.pin, year: s.year, position: p });
  }
  for (const t of result.territories)
    for (const sp of t.storePins) {
      const p = pos(sp.pin);
      if (p && !stores.has(sp.pin)) stores.set(sp.pin, { id: sp.storeId, pin: sp.pin, year: null, position: p });
    }

  // Stones: one per application at its (allocated) pin; several on one pin sit on a small ring.
  const byPin = new Map<string, Decision[]>();
  for (const d of result.decisions) {
    const pin = d.allocatedPin ?? d.pin;
    if (!pin || !pos(pin)) continue;
    byPin.set(pin, [...(byPin.get(pin) ?? []), d]);
  }
  const sorted = [...result.decisions].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.key.localeCompare(b.key));
  const order = new Map(sorted.map((d, i) => [d.key, i]));
  const stones: StoneDatum[] = [];
  for (const [pin, ds] of byPin) {
    const [lng, lat] = pos(pin)!;
    ds.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.key.localeCompare(b.key));
    ds.forEach((d, i) => {
      // first stone sits on the pin; the rest on a ~350 m ring so they never hide each other
      const r = i === 0 ? 0 : 0.0075; // about 800 m, enough to keep labels apart when zoomed in
      const ang = (i / Math.max(1, ds.length - 1)) * Math.PI * 2;
      stones.push({ key: d.key, id: d.id, status: d.status, why: d.why, pin, position: [lng + r * Math.cos(ang), lat + r * Math.sin(ang)], order: order.get(d.key) ?? 0, locked: d.pinned || d.status === "APPROVED", labelLeft: ds.length > 1 && i === 0 });
    });
  }

  // Slot towers at each territory's centre: one block per slot the brand wants.
  const blocks: BlockDatum[] = [];
  const labels: TowerLabel[] = [];
  for (const t of result.territories) {
    const pts = t.pins.map(pos).filter(Boolean) as [number, number][];
    if (!pts.length) continue;
    const lng = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    // nudge the tower just north-east of the pin cluster so it does not cover the stones
    const at: [number, number] = [lng + 0.07, lat + 0.11];
    const kinds: BlockDatum["kind"][] = [];
    t.approved.forEach(() => kinds.push("approved"));
    t.conditional.forEach(() => kinds.push("conditional"));
    for (let i = kinds.length; i < t.effectiveCapacity; i++) kinds.push("open");
    for (let i = t.effectiveCapacity; i < t.slots; i++) kinds.push("ghost");
    kinds.forEach((k, level) => blocks.push({ territory: t.id, kind: k, level, position: [at[0], at[1], level * (BLOCK_H + BLOCK_GAP)] }));
    labels.push({ id: t.id, city: t.city ?? "", position: [at[0], at[1], Math.max(1, kinds.length) * (BLOCK_H + BLOCK_GAP) + 1500], text: `${t.id} · ${t.approved.length + t.conditional.length}/${t.effectiveCapacity}${t.slots > t.effectiveCapacity ? ` (${t.slots} wanted)` : ""}`, anchor: "start" });
  }

  // labels: put a label on the left when another tower sits close by to its east
  for (const l of labels) if (labels.some((o) => o !== l && Math.abs(o.position[1] - l.position[1]) < 0.9 && o.position[0] > l.position[0] && o.position[0] - l.position[0] < 1.6)) l.anchor = "end";

  // Contested outcomes: a gold arc from the challenger to the approved partner it outranks.
  const arcs: ArcDatum[] = [];
  for (const d of result.decisions) {
    if (!d.contested) continue;
    const other = result.decisions.find((x) => x.id === d.contested!.against);
    const a = pos(d.pin);
    const b = pos(other?.allocatedPin ?? other?.pin ?? null);
    if (a && b) arcs.push({ from: a, to: b, label: `${d.id} outranks ${d.contested.against} by ${d.contested.gap}` });
  }
  return { stores: [...stores.values()], stones, blocks, labels, arcs };
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Bounding box of everything that matters, for the initial camera. */
export function dataBounds(result: RunResult): [[number, number], [number, number]] | null {
  const pts: [number, number][] = [];
  for (const t of result.territories) for (const p of t.pins) {
    const c = pos(p);
    if (c) pts.push(c);
  }
  for (const d of result.decisions) {
    const c = pos(d.pin);
    if (c) pts.push(c);
  }
  if (!pts.length) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
}
