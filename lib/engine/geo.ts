// Pin geometry: real km between pin centroids when known, else a labelled pin-number proxy.
import centroidData from "./pin-centroids.json";
import type { Policy } from "./policy";
import type { Nearest, Store } from "./types";

type Centroids = { pins: Record<string, [number, number, ...unknown[]]>; cities?: Record<string, { city: string; lat: number; lon: number }> };
const C = centroidData as unknown as Centroids;

export function centroid(pin: string | null): { lat: number; lon: number; exact: boolean } | null {
  if (!pin) return null;
  const p = C.pins?.[pin];
  if (p) return { lat: p[0], lon: p[1], exact: true };
  const city = C.cities?.[pin.slice(0, 3)];
  if (city) return { lat: city.lat, lon: city.lon, exact: false };
  return null;
}

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLon = toR(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Distance between two pins: km when both have exact centroids, else null (use the proxy). */
export function pinKm(a: string, b: string): number | null {
  if (a === b) return 0;
  const ca = centroid(a);
  const cb = centroid(b);
  if (!ca || !cb || !ca.exact || !cb.exact) return null;
  return Math.round(haversineKm(ca, cb) * 10) / 10;
}

export function pinGap(a: string, b: string): number {
  if (a.slice(0, 3) !== b.slice(0, 3)) return 9999;
  return Math.abs(Number(a) - Number(b));
}

export function maturity(policy: Policy, year: number | null, asOfYear: number) {
  const age = year === null ? 99 : Math.max(0, asOfYear - year);
  const band = policy.cannibalisation.maturity.find((m) => age <= m.maxAgeYears) ?? policy.cannibalisation.maturity[policy.cannibalisation.maturity.length - 1];
  return { age, weight: band.weight, label: band.label };
}

/** Nearest existing store by cannibalisation risk (the store that costs the most points). */
export function nearestStore(policy: Policy, pin: string | null, stores: Store[], asOfYear: number): Nearest | null {
  if (!pin) return null;
  const cp = policy.cannibalisation;
  let best: Nearest | null = null;
  for (const s of stores) {
    const km = pinKm(pin, s.pin);
    const gap = pinGap(pin, s.pin);
    let risk: Nearest["risk"];
    if (km !== null) risk = km <= cp.highKm ? "high" : km <= cp.mediumKm ? "medium" : "low";
    else risk = gap <= cp.proxyHighGap ? "high" : gap <= cp.proxyMediumGap ? "medium" : "low";
    const m = maturity(policy, s.year, asOfYear);
    const base = risk === "high" ? cp.penaltyHigh : risk === "medium" ? cp.penaltyMedium : 0;
    const penalty = Math.round(base * m.weight * 10) / 10;
    const cand: Nearest = { storeId: s.id, pin: s.pin, year: s.year, km, pinGap: gap, basis: km !== null ? "km" : "pin-proxy", risk, weight: m.weight, penalty };
    const closer = (x: Nearest, y: Nearest) => (x.km ?? x.pinGap * 1000) < (y.km ?? y.pinGap * 1000);
    if (!best || cand.penalty > best.penalty || (cand.penalty === best.penalty && closer(cand, best))) best = cand;
  }
  if (best && best.km === null && best.pinGap === 9999) return null;
  return best;
}

/** Are two new sites closer than the spacing threshold? */
export function tooClose(policy: Policy, a: string, b: string): { close: boolean; km: number | null; gap: number } {
  const km = pinKm(a, b);
  const gap = pinGap(a, b);
  if (km !== null) return { close: km < policy.spacing.km, km, gap };
  return { close: gap <= policy.spacing.proxyGap, km: null, gap };
}

export const centroidSource = (centroidData as unknown as { source?: string }).source ?? "";
