"use client";
// Explore: the experience. India in 3D with territory zones and pins (new requests on each). Click a territory and
// the camera goes into it: a 3D slab of that territory built from map tiles, each request a named pin coloured by
// its status, pin areas and the service ring drawn on the ground. Click a request for its tab: verdict and reason,
// satellite view, catchment, rivals and the next step. Counts and tables live in Summary.
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { centroid } from "@/lib/engine/geo";
import type { RunResult } from "@/lib/engine/types";
import { territoryPoints, type MapPoint } from "@/lib/map/terrain";
import { territoryOverlay } from "@/lib/map/pinAreas";
import { loadKarnataka, territoryZones } from "@/lib/map/zones";
import { territoryRequests } from "./map/TerritoryPanels";
import { RequestPanel, STATUS_HEX, storeLocations } from "./explore/RequestPanel";
import { PinLegend } from "./map/PinLegend";
import { StatusChip } from "./icons";

const Diorama = dynamic(() => import("./map/Diorama"), { ssr: false, loading: () => <Loading text="Building the 3D view of India…" /> });
const FlatIndia = dynamic(() => import("./map/FlatIndia"), { ssr: false });

function Loading({ text }: { text: string }) {
  return (
    <div className="absolute inset-0 z-[2] grid place-items-center bg-[#07070bcc]">
      <p className="flex items-center gap-2 text-[13px] text-ink-2">
        <span className="size-3 animate-spin rounded-full border-2 border-[#8f7cff] border-t-transparent" aria-hidden /> {text}
      </p>
    </div>
  );
}

/** The ground a territory slab covers: its pins, its requests and our stores, with a margin, at a pleasing aspect. */
function territoryBbox(points: MapPoint[]): [number, number, number, number] {
  const xs = points.map((p) => p.lngLat[0]);
  const ys = points.map((p) => p.lngLat[1]);
  let [w, e, s, n] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const cx = (w + e) / 2;
  const cy = (s + n) / 2;
  const span = Math.max(0.2, (e - w) * 1.5, (n - s) * 1.5 * 1.3);
  [w, e] = [cx - span / 2, cx + span / 2];
  [s, n] = [cy - span / 2.6, cy + span / 2.6];
  return [w, s, e, n];
}

export function Explore({ result, onFullDecision, onSummary, openCity, onOpened }: { result: RunResult; onFullDecision: (key: string) => void; onSummary: () => void; openCity?: string | null; onOpened?: () => void }) {
  const [territory, setTerritory] = useState<string | null>(null);
  const [request, setRequest] = useState<string | null>(null);
  const [reduced, setReduced] = useState(false);
  const [flat, setFlat] = useState(false);
  const [ready, setReady] = useState(false);
  const [ka, setKa] = useState<GeoJSON.Feature | null>(null);
  useEffect(() => setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  useEffect(() => {
    loadKarnataka().then(setKa);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (request) setRequest(null);
      else if (territory) setTerritory(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request, territory]);

  const tPoints = useMemo(() => territoryPoints(result), [result]);
  // a city clicked on the first page opens straight into its territory
  useEffect(() => {
    if (!openCity) return;
    const p = tPoints.find((x) => x.place === openCity || x.title === openCity);
    if (p) {
      setTerritory(p.key);
      setRequest(null);
    }
    onOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openCity]);
  const zones = useMemo(() => territoryZones(tPoints, ka), [tPoints, ka]);
  const list = useMemo(() => (territory ? territoryRequests(result, territory) : []), [result, territory]);
  const t = territory ? result.territories.find((x) => x.key === territory) : null;
  const title = t ? `${t.id} ${t.city ?? ""}` : territory?.slice(5) ?? "";

  // requests as pins coloured by status; several on one pin code spread on a small ring so each can be clicked
  const reqPoints = useMemo<MapPoint[]>(() => {
    const byPin = new Map<string, number>();
    const pts: MapPoint[] = [];
    for (const d of list) {
      const pin = d.allocatedPin ?? d.pin;
      const c = centroid(pin);
      if (!c || !pin) continue;
      const i = byPin.get(pin) ?? 0;
      byPin.set(pin, i + 1);
      const r = i ? 0.006 : 0;
      const a = i * 2.1;
      pts.push({ key: d.key, title: d.name || d.id, place: "", lngLat: [c.lon + r * Math.cos(a), c.lat + r * Math.sin(a)], color: STATUS_HEX[d.status] });
    }
    return pts;
  }, [list]);
  const storePoints = useMemo<MapPoint[]>(() => {
    if (!reqPoints.length) return [];
    const [w, s, e, n] = territoryBbox(reqPoints);
    return storeLocations(result)
      .filter((st) => st.lon > w && st.lon < e && st.lat > s && st.lat < n)
      .map((st) => ({ key: `store:${st.id}`, title: `Our store ${st.id}`, place: "", lngLat: [st.lon, st.lat] as [number, number], passive: true, muted: true }));
  }, [result, reqPoints]);
  const bbox = useMemo(() => (reqPoints.length ? territoryBbox([...reqPoints, ...(t?.pins.flatMap((p) => { const c = centroid(p); return c ? [{ key: p, title: p, place: "", lngLat: [c.lon, c.lat] as [number, number] }] : []; }) ?? [])]) : null), [reqPoints, t]);
  const decision = request ? result.decisions.find((d) => d.key === request) ?? null : null;
  const overlay = useMemo(() => (territory ? territoryOverlay(result, territory.startsWith("city:") ? decision?.territoryKey ?? null : territory, decision) : zones), [result, territory, decision, zones]);
  const focus = useMemo(() => (request ? reqPoints.find((p) => p.key === request)?.lngLat ?? null : null), [request, reqPoints]);

  const open = (key: string) => {
    setTerritory(key);
    setRequest(null);
    setReady(false);
  };
  const step = (dir: 1 | -1) => {
    if (!decision || !list.length) return;
    const i = list.findIndex((d) => d.key === decision.key);
    setRequest(list[(i + dir + list.length) % list.length].key);
  };

  return (
    <main className="relative isolate h-[calc(100dvh-53px)] w-full overflow-hidden bg-[#07070b]" aria-label="Explore territories and requests">
      {!territory || !bbox ? (
        flat ? (
          <FlatIndia points={tPoints} onPick={open} />
        ) : (
          <Diorama key="overview" source={{ kind: "region" }} points={tPoints} overlay={zones} onPick={open} reducedMotion={reduced} autoRotate onFail={() => setFlat(true)} hint="Drag to rotate · scroll to zoom · click a territory" />
        )
      ) : flat ? (
        <FlatIndia points={reqPoints} activeKey={request} onPick={setRequest} />
      ) : (
        <>
          <Diorama key={territory} source={{ kind: "area", bbox }} points={[...storePoints, ...reqPoints]} activeKey={request} overlay={overlay} focus={focus} onPick={setRequest} reducedMotion={reduced} onReady={() => setReady(true)} onFail={() => setFlat(true)} hint="" />
          {!ready && <Loading text={`Flying into ${title}…`} />}
        </>
      )}

      {!territory && <PinLegend points={tPoints} />}
      {!territory && <p className="pointer-events-none absolute bottom-3 left-3 z-[3] hidden max-w-[300px] sm:block rounded-md bg-black/45 px-2.5 py-1.5 text-[11.5px] text-white/75">Lines split Karnataka by nearest territory: a guide to each territory&apos;s area, not an official boundary.</p>}

      {territory && (
        <div className="absolute left-3 top-3 z-[5] flex items-center gap-2">
          <button type="button" onClick={() => setTerritory(null)} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-[#101019]/90 px-3.5 py-1.5 text-[12.5px] font-medium text-white shadow-lg hover:border-neon">
            ← India
          </button>
          <div className="rounded-full border border-white/10 bg-[#101019]/90 px-3.5 py-1.5 text-[12.5px] text-white shadow-lg">
            <b>{title}</b> <span className="text-white/70">· {list.length} new request{list.length === 1 ? "" : "s"}</span>
          </div>
        </div>
      )}

      {territory && !decision && (
        <section className="rise absolute inset-x-2 bottom-2 z-[6] max-h-[45%] overflow-hidden rounded-2xl border border-white/10 bg-[#0c0c13]/95 shadow-2xl backdrop-blur lg:inset-x-auto lg:bottom-auto lg:right-3 lg:top-3 lg:max-h-[calc(100%-24px)] lg:w-[340px]" aria-label={`Requests in ${title}`}>
          <p className="border-b border-white/10 px-4 py-2.5 text-[12.5px] text-muted">Pick a request to review it</p>
          <ul className="scrollbar-thin max-h-[calc(45vh-44px)] overflow-y-auto py-1 lg:max-h-[calc(100dvh-140px)]" data-testid="territory-requests">
            {list.map((d) => (
              <li key={d.key}>
                <button type="button" data-request={d.key} onClick={() => setRequest(d.key)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5">
                  <i className="size-2.5 shrink-0 rounded-full" style={{ background: STATUS_HEX[d.status], boxShadow: `0 0 8px ${STATUS_HEX[d.status]}` }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-ink">{d.name || d.id}</span>
                    <span className="block truncate text-[12px] text-muted">{d.why}</span>
                  </span>
                  <StatusChip status={d.status} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {decision && (
        <RequestPanel
          result={result}
          decision={decision}
          index={Math.max(0, list.findIndex((d) => d.key === decision.key))}
          total={list.length || 1}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onClose={() => setRequest(null)}
          onFullDecision={() => onFullDecision(decision.key)}
        />
      )}

      {!territory && (
        <button type="button" onClick={onSummary} className="absolute right-3 top-3 z-[5] hidden rounded-full lg:block border border-white/15 bg-[#101019]/90 px-3.5 py-1.5 text-[12.5px] font-medium text-white shadow-lg hover:border-neon">
          Summary dashboard →
        </button>
      )}
    </main>
  );
}
