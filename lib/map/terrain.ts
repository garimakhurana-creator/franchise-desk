// Data for the terrain map: territory callouts with request counts, stones, towers, discs, arcs.
import { centroid } from "../engine/geo";
import reference from "../engine/reference.json";
import type { RunResult, Status } from "../engine/types";

export interface Callout {
  key: string; // territory key, or "city:<name>" for a city without a territory
  title: string; // "TER-02"
  place: string; // "Bengaluru"
  requests: number;
  used: number;
  capacity: number;
  wanted: number;
  counts: Record<Status, number>;
  lngLat: [number, number];
  noTerritory?: boolean;
}

const pos = (pin: string | null): [number, number] | null => {
  const c = centroid(pin);
  return c ? [c.lon, c.lat] : null;
};

const ZERO = (): Record<Status, number> => ({ APPROVED: 0, CONDITIONAL: 0, WAITLISTED: 0, ON_HOLD: 0, DECLINED: 0, WITHDRAWN: 0 });
const STATUS_ORDER: Record<Status, number> = { APPROVED: 0, CONDITIONAL: 1, WAITLISTED: 2, ON_HOLD: 3, DECLINED: 4, WITHDRAWN: 5 };

export function buildTerrainData(result: RunResult) {
  // Territory callouts: requests are every application linked to the territory by pin.
  const callouts: Callout[] = [];
  for (const t of result.territories) {
    const pts = t.pins.map(pos).filter(Boolean) as [number, number][];
    if (!pts.length) continue;
    const lng = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const counts = ZERO();
    const ds = result.decisions.filter((d) => d.territoryKey === t.key);
    for (const d of ds) counts[d.status]++;
    callouts.push({ key: t.key, title: t.id, place: t.city ?? "", requests: ds.length, used: t.approved.length + t.conditional.length, capacity: t.effectiveCapacity, wanted: t.slots, counts, lngLat: [lng, lat] });
  }
  // Cities with requests but no territory (for example a pin outside every territory).
  const orphan = new Map<string, { counts: Record<Status, number>; n: number; pts: [number, number][] }>();
  for (const d of result.decisions) {
    if (d.territoryKey || !d.pin) continue;
    const city = reference.cities.find((c) => c.prefix === d.pin!.slice(0, 3))?.city;
    const p = pos(d.pin);
    if (!city || !p) continue;
    const cur = orphan.get(city) ?? { counts: ZERO(), n: 0, pts: [] };
    cur.counts[d.status]++;
    cur.n++;
    cur.pts.push(p);
    orphan.set(city, cur);
  }
  for (const [city, o] of orphan) {
    const lng = o.pts.reduce((s, p) => s + p[0], 0) / o.pts.length;
    const lat = o.pts.reduce((s, p) => s + p[1], 0) / o.pts.length;
    callouts.push({ key: `city:${city}`, title: city, place: "no territory", requests: o.n, used: 0, capacity: 0, wanted: 0, counts: o.counts, lngLat: [lng, lat], noTerritory: true });
  }

  // Stones: one per application; several on one pin spread on a small ring.
  const byPin = new Map<string, typeof result.decisions>();
  for (const d of result.decisions) {
    const pin = d.allocatedPin ?? d.pin;
    if (!pin || !pos(pin)) continue;
    byPin.set(pin, [...(byPin.get(pin) ?? []), d]);
  }
  const stones: GeoJSON.Feature<GeoJSON.Point>[] = [];
  for (const [pin, ds] of byPin) {
    const [lng, lat] = pos(pin)!;
    ds.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.key.localeCompare(b.key));
    ds.forEach((d, i) => {
      const r = i === 0 ? 0 : 0.006;
      const ang = (i / Math.max(1, ds.length - 1)) * Math.PI * 2;
      stones.push({ type: "Feature", geometry: { type: "Point", coordinates: [lng + r * Math.cos(ang), lat + r * Math.sin(ang)] }, properties: { key: d.key, id: d.id, status: d.status, why: d.why, locked: d.status === "APPROVED" } });
    });
  }

  // Slot towers: stacked square blocks just north-east of each territory's pins.
  const towers: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
  const BLOCK = 5200;
  const GAP = 1600;
  for (const t of result.territories) {
    const c = callouts.find((x) => x.key === t.key);
    if (!c) continue;
    const [lng, lat] = [c.lngLat[0] + 0.11, c.lngLat[1] + 0.09];
    const s = 0.032;
    const square: GeoJSON.Position[] = [[lng - s, lat - s], [lng + s, lat - s], [lng + s, lat + s], [lng - s, lat + s], [lng - s, lat - s]];
    const kinds: string[] = [];
    t.approved.forEach(() => kinds.push("approved"));
    t.conditional.forEach(() => kinds.push("conditional"));
    for (let i = kinds.length; i < t.effectiveCapacity; i++) kinds.push("open");
    for (let i = t.effectiveCapacity; i < t.slots; i++) kinds.push("ghost");
    kinds.forEach((k, level) => towers.push({ type: "Feature", geometry: { type: "Polygon", coordinates: [square] }, properties: { kind: k, base: level * (BLOCK + GAP), top: level * (BLOCK + GAP) + BLOCK, territory: t.id } }));
  }

  // Existing stores and their 2 km catchment discs.
  const stores: GeoJSON.Feature<GeoJSON.Point>[] = [];
  const discs: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
  const seen = new Set<string>();
  const storeList = [...reference.stores, ...result.territories.flatMap((t) => t.storePins.map((sp) => ({ id: sp.storeId, pin: sp.pin, year: null as number | null, city: "" })))];
  for (const s of storeList) {
    if (seen.has(s.pin)) continue;
    seen.add(s.pin);
    const p = pos(s.pin);
    if (!p) continue;
    stores.push({ type: "Feature", geometry: { type: "Point", coordinates: p }, properties: { id: s.id, year: s.year } });
    discs.push(circle(p, 2));
  }

  // Contested outcomes: a dashed neon arc from the challenger to the approved partner.
  const arcs: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (const d of result.decisions) {
    if (!d.contested) continue;
    const other = result.decisions.find((x) => x.id === d.contested!.against);
    const a = pos(d.pin);
    const b = pos(other?.allocatedPin ?? other?.pin ?? null);
    if (a && b) arcs.push({ type: "Feature", geometry: { type: "LineString", coordinates: [a, b] }, properties: { label: `${d.id} outranks ${d.contested.against} by ${d.contested.gap}` } });
  }

  return { callouts, stones: fc(stones), towers: fc(towers), stores: fc(stores), discs: fc(discs), arcs: fc(arcs) };
}

function fc<T extends GeoJSON.Geometry>(features: GeoJSON.Feature<T>[]): GeoJSON.FeatureCollection<T> {
  return { type: "FeatureCollection", features };
}

export function circle([lng, lat]: [number, number], km: number, steps = 48): GeoJSON.Feature<GeoJSON.Polygon> {
  const ring: GeoJSON.Position[] = [];
  const dLat = km / 110.574;
  const dLng = km / (111.32 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [ring] }, properties: {} };
}

/** Everything outside India as one polygon with India's outlines as holes: the "India only" mask. */
export function worldMask(india: GeoJSON.Feature<GeoJSON.MultiPolygon | GeoJSON.Polygon>): GeoJSON.Feature<GeoJSON.Polygon> {
  const outer: GeoJSON.Position[] = [[-179.9, -85], [179.9, -85], [179.9, 85], [-179.9, 85], [-179.9, -85]];
  const polys = india.geometry.type === "Polygon" ? [india.geometry.coordinates] : india.geometry.coordinates;
  // MapLibre tells holes from new polygons by winding: holes must wind opposite to the outer ring.
  const area = (r: GeoJSON.Position[]) => r.reduce((s, p, i) => (i ? s + (r[i - 1][0] * p[1] - p[0] * r[i - 1][1]) : 0), 0);
  const sOuter = Math.sign(area(outer));
  const holes = polys.map((p) => (Math.sign(area(p[0])) === sOuter ? [...p[0]].reverse() : p[0]));
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [outer, ...holes] }, properties: {} };
}

export function karnatakaBounds(result: RunResult): [[number, number], [number, number]] {
  const pts: [number, number][] = [];
  for (const t of result.territories) for (const p of t.pins) {
    const c = pos(p);
    if (c) pts.push(c);
  }
  for (const d of result.decisions) {
    const c = pos(d.pin);
    if (c) pts.push(c);
  }
  if (!pts.length) return [[74, 11.5], [78.6, 18.5]];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [[Math.min(...xs) - 0.4, Math.min(...ys) - 0.4], [Math.max(...xs) + 0.4, Math.max(...ys) + 0.4]];
}

/** A named place on the 3D overview: a territory, or a city when no file is loaded yet. Names only, no numbers. */
export interface MapPoint {
  key: string;
  title: string;
  place: string;
  lngLat: [number, number];
  muted?: boolean;
  /** New requests in this place, shown on its pin. */
  count?: number;
}

export function territoryPoints(result: RunResult): MapPoint[] {
  return buildTerrainData(result).callouts.map((c) => ({ key: c.key, title: c.title, place: c.noTerritory ? `${c.place}` : c.place, lngLat: c.lngLat, muted: c.noTerritory, count: c.requests }));
}

/** Before any upload: the expansion cities from the case template, so the first page already shows where the brand operates. */
export function cityPoints(): MapPoint[] {
  return reference.cities.flatMap((c) => {
    const p = centroid(`${c.prefix}000`);
    return p ? [{ key: `city:${c.city}`, title: c.city, place: `Tier ${c.tier}`, lngLat: [p.lon, p.lat] as [number, number] }] : [];
  });
}
