// Approximate pin-code areas for the deep dive. We have each pin's centre (geocoded once), not its boundary,
// so each area is the Voronoi cell of its centre among neighbouring pins, capped at a 2.5 km radius.
// The map and panel label these as approximate.
import { Delaunay } from "d3-delaunay";
import C from "../engine/pin-centroids.json";
import { centroid } from "../engine/geo";
import type { Decision, RunResult } from "../engine/types";
import { circle } from "./terrain";

type Pt = [number, number];
export type AreaKind = "applicant" | "store" | "taken" | "free" | "rival";

const PINS = (C as unknown as { pins: Record<string, [number, number, ...unknown[]]> }).pins;
const CAP_KM = 2.5;
export const SERVICE_KM = 2; // same catchment the map draws round existing stores

/** Clip convex polygon `subject` to convex polygon `clip` (Sutherland-Hodgman). Both rings closed or open. */
function clipConvex(subject: Pt[], clip: Pt[]): Pt[] {
  const open = (r: Pt[]) => (r.length > 1 && r[0][0] === r.at(-1)![0] && r[0][1] === r.at(-1)![1] ? r.slice(0, -1) : r);
  let out = open(subject);
  const c = open(clip);
  const ccw = c.reduce((s, p, i) => s + (c[(i + 1) % c.length][0] - p[0]) * (c[(i + 1) % c.length][1] + p[1]), 0) < 0;
  const inside = (p: Pt, a: Pt, b: Pt) => {
    const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    return ccw ? cross >= 0 : cross <= 0;
  };
  const hit = (p: Pt, q: Pt, a: Pt, b: Pt): Pt => {
    const d = (p[0] - q[0]) * (a[1] - b[1]) - (p[1] - q[1]) * (a[0] - b[0]);
    const t = ((p[0] - a[0]) * (a[1] - b[1]) - (p[1] - a[1]) * (a[0] - b[0])) / d;
    return [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
  };
  for (let i = 0; i < c.length && out.length; i++) {
    const a = c[i];
    const b = c[(i + 1) % c.length];
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j];
      const q = input[(j + input.length - 1) % input.length];
      if (inside(p, a, b)) {
        if (!inside(q, a, b)) out.push(hit(q, p, a, b));
        out.push(p);
      } else if (inside(q, a, b)) out.push(hit(q, p, a, b));
    }
  }
  return out.length ? [...out, out[0]] : [];
}

/** Area polygons for the given pins, bounded by their neighbours in the same cities. */
export function pinCells(pins: string[]): Map<string, GeoJSON.Polygon> {
  const want = [...new Set(pins)].filter((p) => PINS[p]);
  const res = new Map<string, GeoJSON.Polygon>();
  if (!want.length) return res;
  const prefixes = new Set(want.map((p) => p.slice(0, 3)));
  const all = Object.keys(PINS).filter((p) => prefixes.has(p.slice(0, 3)));
  const pts: Pt[] = all.map((p) => [PINS[p][1], PINS[p][0]]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const pad = 0.06;
  const vor = Delaunay.from(pts).voronoi([Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad]);
  for (const pin of want) {
    const i = all.indexOf(pin);
    const cell = vor.cellPolygon(i) as Pt[] | null;
    if (!cell) continue;
    const cap = circle(pts[i], CAP_KM, 32).geometry.coordinates[0] as Pt[];
    const ring = clipConvex(cell, cap);
    if (ring.length > 3) res.set(pin, { type: "Polygon", coordinates: [ring] });
  }
  return res;
}

/**
 * Overlay for one territory, optionally focused on one request: every pin area coloured by what it holds
 * (our store, a partner's pin, free), the request's own pin glowing, and its 2 km service ring.
 */
export function territoryOverlay(result: RunResult, territoryKey: string | null, focus: Decision | null): GeoJSON.FeatureCollection {
  const t = territoryKey ? result.territories.find((x) => x.key === territoryKey) : null;
  const focusPin = focus ? focus.allocatedPin ?? focus.pin : null;
  const storePins = new Set(t?.storePins.map((s) => s.pin) ?? []);
  const taken = new Map<string, string>();
  for (const d of result.decisions) if ((d.status === "APPROVED" || d.status === "CONDITIONAL") && d.allocatedPin) taken.set(d.allocatedPin, d.id);
  const rivals = new Set(focus ? result.decisions.filter((d) => d.key !== focus.key && d.territoryKey && d.territoryKey === focus.territoryKey).map((d) => d.allocatedPin ?? d.pin) : []);
  const pins = [...(t?.pins ?? []), ...(focusPin ? [focusPin] : [])];
  const cells = pinCells(pins);
  const features: GeoJSON.Feature[] = [];
  for (const [pin, geom] of cells) {
    const kind: AreaKind = pin === focusPin ? "applicant" : storePins.has(pin) ? "store" : taken.has(pin) ? "taken" : rivals.has(pin) ? "rival" : "free";
    features.push({ type: "Feature", geometry: geom, properties: { pin, kind, holder: taken.get(pin) ?? null } });
  }
  const c = centroid(focusPin);
  if (c) features.push({ ...circle([c.lon, c.lat], SERVICE_KM, 64), properties: { kind: "service" } });
  if (c && focus?.nearest) {
    const s = centroid(focus.nearest.pin);
    if (s) features.push({ type: "Feature", geometry: { type: "LineString", coordinates: [[c.lon, c.lat], [s.lon, s.lat]] }, properties: { kind: "nearest" } });
  }
  return { type: "FeatureCollection", features };
}

/** Square kilometres of a lng/lat polygon ring (small areas, equirectangular). */
export function areaKm2(poly: GeoJSON.Polygon): number {
  const r = poly.coordinates[0];
  const lat0 = (r.reduce((s, p) => s + p[1], 0) / r.length) * (Math.PI / 180);
  const kx = 111.32 * Math.cos(lat0);
  const ky = 110.574;
  let a = 0;
  for (let i = 1; i < r.length; i++) a += (r[i - 1][0] * kx) * (r[i][1] * ky) - (r[i][0] * kx) * (r[i - 1][1] * ky);
  return Math.abs(a / 2);
}
