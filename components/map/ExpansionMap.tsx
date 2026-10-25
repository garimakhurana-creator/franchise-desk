"use client";

// The Expansion Table: India only, a globe intro that settles on Karnataka, slot towers,
// store monoliths, application stones and contested arcs. Lazily loaded; any failure calls
// onFail so the parent drops to the table. Never throws into the parent.
import { useEffect, useMemo, useRef } from "react";
import maplibregl, { type Map as MlMap, type StyleSpecification } from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ArcLayer, ColumnLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { Layer, PickingInfo } from "@deck.gl/core";
import "maplibre-gl/dist/maplibre-gl.css";
import type { RunResult, Status } from "@/lib/engine/types";
import { BLOCK_H, buildMapData, dataBounds, escapeHtml, PALETTE, type BlockDatum, type Palette, type StoneDatum } from "@/lib/map/data";

export interface ExpansionMapProps {
  result: RunResult;
  selected: string | null;
  highlight: string[];
  onSelect: (key: string) => void;
  theme: "light" | "dark";
  reducedMotion: boolean;
  onFail: (reason: string) => void;
}

const INDIA_BOUNDS: [[number, number], [number, number]] = [[62, 4], [101, 38.5]];
const STATUS_LABEL: Record<Status, string> = { APPROVED: "Approved", CONDITIONAL: "Conditional", ON_HOLD: "On hold", WAITLISTED: "Waitlisted", DECLINED: "Declined", WITHDRAWN: "Withdrawn" };
const FALL_FROM = 60000; // metres a stone falls from during the landing
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function webglOk(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function style(p: Palette): StyleSpecification {
  return {
    version: 8,
    projection: { type: "globe" },
    sources: { india: { type: "geojson", data: new URL("/geo/india.json", location.origin).href } },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": p.bg } },
      { id: "india-fill", type: "fill", source: "india", filter: ["==", ["get", "kind"], "india"], paint: { "fill-color": p.land, "fill-antialias": true } },
      { id: "states", type: "line", source: "india", filter: ["==", ["get", "kind"], "state"], paint: { "line-color": p.state, "line-width": 0.7 } },
      { id: "focus-fill", type: "fill", source: "india", filter: ["==", ["get", "kind"], "karnataka"], paint: { "fill-color": p.focusFill } },
      { id: "focus-edge", type: "line", source: "india", filter: ["==", ["get", "kind"], "karnataka"], paint: { "line-color": p.focusEdge, "line-width": 1.4, "line-blur": 0.4 } },
      { id: "india-edge", type: "line", source: "india", filter: ["==", ["get", "kind"], "india"], paint: { "line-color": p.landEdge, "line-width": 1.1 } },
    ],
  } as StyleSpecification;
}

export default function ExpansionMap(props: ExpansionMapProps) {
  const { result, selected, highlight, onSelect, theme, reducedMotion, onFail } = props;
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const failed = useRef(false);
  const ready = useRef(false);
  const landing = useRef<{ start: number; done: boolean }>({ start: 0, done: false });
  const elevScale = useRef(12);
  const latest = useRef(props);
  latest.current = props;
  const data = useMemo(() => buildMapData(result), [result]);
  const dataRef = useRef(data);
  dataRef.current = data;

  const fail = (reason: string) => {
    if (failed.current) return;
    failed.current = true;
    try {
      latest.current.onFail(reason);
    } catch {
      /* parent errors must not escape */
    }
  };

  // ---------- layers (rebuilt imperatively, never through per-frame React state) ----------
  const render = () => {
    const ov = overlayRef.current;
    if (!ov || !ready.current) return;
    try {
      ov.setProps({ layers: buildLayers() });
    } catch (e) {
      fail(`map layers failed: ${(e as Error).message}`);
    }
  };

  function buildLayers(): Layer[] {
    const { theme: th, selected: sel, highlight: hi } = latest.current;
    const p = PALETTE[th];
    const d = dataRef.current;
    const now = performance.now();
    const L = landing.current;
    const n = Math.max(1, d.stones.length);
    const span = 1500; // stagger window; each fall lasts 700 ms -> about 2.2 s in total
    const z = (s: StoneDatum) => {
      if (L.done) return 0;
      const t = (now - L.start - (s.order / n) * span) / 700;
      return t <= 0 ? FALL_FROM : t >= 1 ? 0 : FALL_FROM * (1 - easeOut(t));
    };
    const visible = (s: StoneDatum) => L.done || now - L.start - (s.order / n) * span > 0;
    const es = elevScale.current;
    const hiSet = new Set(hi);
    const blockColor = (b: BlockDatum): [number, number, number, number] => {
      const g = p.gold;
      if (b.kind === "approved") return [g[0], g[1], g[2], 245];
      if (b.kind === "conditional") return [g[0], g[1], g[2], 120];
      if (b.kind === "open") return [g[0], g[1], g[2], 28];
      return [p.store[0], p.store[1], p.store[2], 22];
    };
    const blockLine = (b: BlockDatum): [number, number, number, number] => {
      const g = p.gold;
      if (b.kind === "ghost") return [p.store[0], p.store[1], p.store[2], 90];
      return [g[0], g[1], g[2], b.kind === "open" ? 210 : 255];
    };
    const layers: Layer[] = [
      new ScatterplotLayer({
        id: "catchments",
        data: d.stores,
        getPosition: (s) => s.position,
        getRadius: 2000,
        radiusUnits: "meters",
        getFillColor: p.storeDisc,
        stroked: true,
        getLineColor: [p.store[0], p.store[1], p.store[2], 70],
        lineWidthMinPixels: 1,
        parameters: { depthWriteEnabled: false },
      }),
      new ScatterplotLayer({
        id: "tower-halo",
        data: d.labels,
        getPosition: (l) => [l.position[0], l.position[1], 0],
        getRadius: 22,
        radiusUnits: "pixels",
        getFillColor: [p.gold[0], p.gold[1], p.gold[2], th === "dark" ? 34 : 46],
        stroked: true,
        getLineColor: [p.gold[0], p.gold[1], p.gold[2], th === "dark" ? 90 : 120],
        lineWidthMinPixels: 1,
        parameters: { depthWriteEnabled: false },
        updateTriggers: { getFillColor: th, getLineColor: th },
      }),
      new ColumnLayer({
        id: "stores",
        data: d.stores,
        getPosition: (s) => s.position,
        diskResolution: 4,
        angle: 45,
        radius: 3.2,
        radiusUnits: "pixels",
        extruded: true,
        getElevation: 1500,
        elevationScale: es,
        getFillColor: p.store,
        material: { ambient: 0.55, diffuse: 0.5, shininess: 8 },
        pickable: true,
      }),
      new ColumnLayer<BlockDatum>({
        id: "slot-towers",
        data: d.blocks,
        getPosition: (b) => [b.position[0], b.position[1], b.position[2] * es],
        diskResolution: 4,
        angle: 45,
        radius: 9,
        radiusUnits: "pixels",
        extruded: true,
        wireframe: true,
        getElevation: BLOCK_H,
        elevationScale: es,
        getFillColor: blockColor,
        getLineColor: blockLine,
        material: { ambient: 0.7, diffuse: 0.45, shininess: 24 },
        pickable: true,
        updateTriggers: { getFillColor: th, getLineColor: th, getPosition: es },
      }),
      new ScatterplotLayer<StoneDatum>({
        id: "stone-rings",
        parameters: { depthCompare: "always" },
        data: d.stones.filter((s) => s.locked && visible(s)),
        getPosition: (s) => [s.position[0], s.position[1], z(s) * es],
        getRadius: (s) => (s.key === sel ? 14 : 10.5),
        radiusUnits: "pixels",
        stroked: true,
        filled: false,
        getLineColor: (s) => p.status[s.status],
        lineWidthMinPixels: 1.4,
        updateTriggers: { getPosition: [now, es], getRadius: sel, getLineColor: th },
      }),
      new ScatterplotLayer<StoneDatum>({
        id: "stones",
        parameters: { depthCompare: "always" },
        data: d.stones.filter(visible),
        getPosition: (s) => [s.position[0], s.position[1], z(s) * es],
        getRadius: (s) => (s.key === sel ? 9.5 : hiSet.has(s.key) ? 8.5 : 6.5),
        radiusUnits: "pixels",
        getFillColor: (s) => {
          const c = p.status[s.status];
          const dim = sel && s.key !== sel && !hiSet.has(s.key) ? 150 : 255;
          return [c[0], c[1], c[2], dim];
        },
        stroked: true,
        getLineColor: (s) => (s.key === sel ? [p.text === "#efe9dd" ? 239 : 22, p.text === "#efe9dd" ? 233 : 35, p.text === "#efe9dd" ? 221 : 42, 255] : hiSet.has(s.key) ? p.gold : [0, 0, 0, 90]),
        lineWidthMinPixels: 1,
        getLineWidth: (s) => (s.key === sel ? 2.5 : hiSet.has(s.key) ? 2 : 1),
        lineWidthUnits: "pixels",
        pickable: true,
        updateTriggers: { getPosition: [now, es], getRadius: [sel, hi.join()], getFillColor: [th, sel, hi.join()], getLineColor: [th, sel, hi.join()], getLineWidth: [sel, hi.join()] },
      }),
      new ArcLayer({
        id: "contested",
        data: d.arcs,
        getSourcePosition: (a) => a.from,
        getTargetPosition: (a) => a.to,
        getSourceColor: p.arc,
        getTargetColor: p.arc,
        getWidth: 3,
        widthUnits: "pixels",
        getHeight: 1.2,
        parameters: { depthCompare: "always" },
        pickable: true,
      }),
      new TextLayer<StoneDatum>({
        id: "stone-labels",
        data: d.stones.filter(visible),
        visible: es < 2.5, // only when zoomed in to a city
        getPosition: (s) => s.position,
        getText: (s) => s.id,
        getSize: 11,
        getColor: (th === "dark" ? [211, 214, 207, 235] : [51, 68, 75, 235]) as [number, number, number, number],
        fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif",
        fontWeight: 600,
        getTextAnchor: (s) => (s.labelLeft ? "end" : "start"),
        getAlignmentBaseline: "center",
        getPixelOffset: (s) => (s.labelLeft ? [-11, 0] : [11, 0]),
        parameters: { depthCompare: "always" },
        characterSet: "auto",
        updateTriggers: { getColor: th },
      }),
      new TextLayer({
        id: "tower-labels",
        data: d.labels,
        getPosition: (l) => [l.position[0], l.position[1], l.position[2] * es],
        getText: (l) => l.text,
        getSize: 12,
        getColor: [...(th === "dark" ? [239, 233, 221] : [22, 35, 42]), 230] as [number, number, number, number],
        fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif",
        fontWeight: 600,
        getTextAnchor: (l) => l.anchor,
        getAlignmentBaseline: "bottom",
        getPixelOffset: (l) => (l.anchor === "end" ? [-12, 0] : [12, 0]),
        background: true,
        getBackgroundColor: (th === "dark" ? [13, 27, 36, 210] : [251, 250, 246, 220]) as [number, number, number, number],
        backgroundPadding: [5, 3],
        characterSet: "auto",
        updateTriggers: { getPosition: es, getColor: th, getBackgroundColor: th },
      }),
    ];
    return layers;
  }

  // ---------- create the map once ----------
  useEffect(() => {
    if (!box.current) return;
    if (!webglOk()) {
      fail("WebGL is not available in this browser");
      return;
    }
    let map: MlMap;
    let raf = 0;
    let fpsRaf = 0;
    const cleanup: (() => void)[] = [];
    try {
      map = new maplibregl.Map({
        container: box.current,
        style: style(PALETTE[latest.current.theme]),
        center: [79.5, 22.5],
        zoom: 2.4,
        pitch: 0,
        attributionControl: false,
        renderWorldCopies: false,
        maxPitch: 70,
        fadeDuration: 0,
      });
    } catch (e) {
      fail(`map could not start: ${(e as Error).message}`);
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "Boundaries: Natural Earth · Pin centres: OpenStreetMap Nominatim, GeoNames" }), "bottom-right");
    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), "top-right");
    map.on("error", (ev) => {
      const msg = (ev as { error?: Error }).error?.message ?? "map error";
      if (/india\.json|style|webgl|context/i.test(msg)) fail(`map data unavailable: ${msg}`);
    });
    const lost = () => fail("WebGL context lost");
    map.getCanvas().addEventListener("webglcontextlost", lost);
    cleanup.push(() => map.getCanvas().removeEventListener("webglcontextlost", lost));

    const overlay = new MapboxOverlay({
      interleaved: true,
      layers: [],
      getTooltip: (info: PickingInfo) => tooltip(info),
      onClick: (info: PickingInfo) => {
        const o = info.object as StoneDatum | undefined;
        if (info.layer?.id === "stones" && o?.key) latest.current.onSelect(o.key);
      },
      onError: (err: Error) => {
        fail(`map layers failed: ${err.message}`);
      },
    });
    overlayRef.current = overlay;

    const skipLanding = () => {
      if (!landing.current.done) {
        landing.current.done = true;
        render();
      }
    };
    window.addEventListener("keydown", skipLanding, { once: true });
    map.getCanvas().addEventListener("pointerdown", skipLanding, { once: true });
    cleanup.push(() => window.removeEventListener("keydown", skipLanding));

    const onZoom = () => {
      // keep towers readable at every zoom: elevation shrinks as you zoom in
      const s = Math.min(60, Math.max(0.4, Math.pow(2, 10.25 - map.getZoom())));
      if (Math.abs(s - elevScale.current) / elevScale.current > 0.04) {
        elevScale.current = s;
        render();
      }
    };

    map.on("load", () => {
      try {
        map.addControl(overlay as unknown as maplibregl.IControl);
      } catch (e) {
        fail(`3D layer could not attach: ${(e as Error).message}`);
        return;
      }
      const b = dataBounds(latest.current.result);
      const target = b ? { center: [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2] as [number, number] } : { center: [76.1, 14.3] as [number, number] };
      const settle = () => {
        try {
          map.setProjection({ type: "mercator" });
        } catch {
          /* projection switch is cosmetic */
        }
        map.setMaxBounds(INDIA_BOUNDS);
        map.setMinZoom(3.6);
        ready.current = true;
        onZoom();
        map.on("zoom", onZoom);
        landing.current.start = performance.now();
        landing.current.done = latest.current.reducedMotion;
        if (!landing.current.done) {
          const tick = () => {
            render();
            if (performance.now() - landing.current.start < 2400 && !landing.current.done) raf = requestAnimationFrame(tick);
            else {
              landing.current.done = true;
              render();
            }
          };
          raf = requestAnimationFrame(tick);
        } else render();
        startFpsWatch();
        // a selection made before the intro finished is honoured now
        const sel = latest.current.selected;
        const st = sel ? dataRef.current.stones.find((x) => x.key === sel) : null;
        if (st) map.easeTo({ center: st.position, zoom: 11.8, pitch: 55, duration: latest.current.reducedMotion ? 0 : 1100 });
      };
      const narrow = (box.current?.clientWidth ?? 1200) < 640;
      const fit = b ? map.cameraForBounds(b, { padding: narrow ? { top: 150, bottom: 90, left: 24, right: 24 } : { top: 90, bottom: 120, left: 80, right: 80 }, pitch: 54, bearing: -16 }) : null;
      const final = { center: (fit?.center as [number, number] | undefined) ?? target.center, zoom: Math.min(7.2, fit?.zoom ?? 6.5), pitch: 54, bearing: -16 };
      if (latest.current.reducedMotion) {
        map.jumpTo(final);
        settle();
      } else {
        // globe intro: India alone on the sphere, then down to the territories
        map.once("moveend", settle);
        map.flyTo({ ...final, duration: 3200, curve: 1.6, essential: true });
      }
    });

    function startFpsWatch() {
      let frames = 0;
      let last = performance.now();
      let slow = 0;
      const loop = () => {
        frames++;
        const t = performance.now();
        if (t - last >= 1000) {
          const fps = (frames * 1000) / (t - last);
          // only judge while the map is actually animating and the tab is visible
          if (!document.hidden && map.isMoving()) slow = fps < 30 ? slow + 1 : 0;
          if (slow >= 3) fail(`frame rate ${Math.round(fps)} fps`);
          frames = 0;
          last = t;
        }
        fpsRaf = requestAnimationFrame(loop);
      };
      fpsRaf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(fpsRaf);
      cleanup.forEach((f) => f());
      try {
        overlay.finalize();
      } catch {
        /* ignore */
      }
      try {
        map.remove();
      } catch {
        /* ignore */
      }
      mapRef.current = null;
      overlayRef.current = null;
      ready.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- data, selection and theme updates ----------
  useEffect(() => {
    render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, highlight, selected]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const p = PALETTE[theme];
    try {
      map.setPaintProperty("bg", "background-color", p.bg);
      map.setPaintProperty("india-fill", "fill-color", p.land);
      map.setPaintProperty("states", "line-color", p.state);
      map.setPaintProperty("focus-fill", "fill-color", p.focusFill);
      map.setPaintProperty("focus-edge", "line-color", p.focusEdge);
      map.setPaintProperty("india-edge", "line-color", p.landEdge);
    } catch {
      /* theme is cosmetic */
    }
    render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selected || !ready.current) return;
    const s = dataRef.current.stones.find((x) => x.key === selected);
    if (!s) return;
    const cam = { center: s.position, zoom: Math.max(map.getZoom(), 11.8), pitch: 55 };
    if (reducedMotion) map.jumpTo(cam);
    else map.easeTo({ ...cam, duration: 1100, easing: (t) => 1 - Math.pow(1 - t, 3) });
  }, [selected, reducedMotion]);

  const counts = useMemo(() => {
    const c: Partial<Record<Status, number>> = {};
    for (const s of data.stones) c[s.status] = (c[s.status] ?? 0) + 1;
    return c;
  }, [data]);
  const p = PALETTE[theme];
  const rgb = (c: number[]) => `rgb(${c[0]},${c[1]},${c[2]})`;

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: p.bg }}>
      <div ref={box} style={{ position: "absolute", inset: 0 }} aria-label="3D map of India showing territories, slot towers, existing stores and applications" role="application" />
      <div className="pointer-events-none absolute left-3 top-3 max-w-[calc(100%-76px)] rounded-[10px] px-3 py-2.5 text-[11px] leading-snug sm:top-auto sm:bottom-3 sm:max-w-[300px] sm:text-[11.5px]" style={{ background: theme === "dark" ? "rgba(13,27,36,0.86)" : "rgba(251,250,246,0.9)", color: p.text, boxShadow: `inset 0 0 0 1px ${theme === "dark" ? "#2a4b59" : "#d6cfbf"}` }}>
        <div className="mb-1.5 flex items-center gap-2">
          <span className="inline-block h-3 w-2" style={{ background: rgb(p.store) }} aria-hidden />
          <span>Existing store, with a 2 km disc</span>
        </div>
        <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span style={{ color: p.muted }}>Slots:</span>
          <Swatch c={rgb(p.gold)} label="approved" />
          <Swatch c={rgb(p.gold)} label="reserved" hatch />
          <Swatch c={rgb(p.gold)} label="open" outline />
          <Swatch c={rgb(p.store)} label="blocked by pins" outline faint />
        </div>
        <div className="flex flex-wrap gap-x-2.5 gap-y-1">
          {(Object.keys(STATUS_LABEL) as Status[]).filter((s) => counts[s]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1">
              <span className="inline-block size-2 rounded-full" style={{ background: rgb(p.status[s]) }} aria-hidden />
              {STATUS_LABEL[s]} {counts[s]}
            </span>
          ))}
        </div>
        <div className="mt-1.5" style={{ color: p.muted }}>Pin centres are approximate; no catchment boundaries were provided.</div>
      </div>
    </div>
  );
}

function Swatch({ c, label, hatch, outline, faint }: { c: string; label: string; hatch?: boolean; outline?: boolean; faint?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1" style={{ opacity: faint ? 0.7 : 1 }}>
      <span
        className="inline-block h-2.5 w-3.5 rounded-[2px]"
        style={outline ? { boxShadow: `inset 0 0 0 1.3px ${c}` } : hatch ? { backgroundImage: `repeating-linear-gradient(135deg, ${c} 0 1.5px, transparent 1.5px 4px)`, boxShadow: `inset 0 0 0 1.3px ${c}` } : { background: c }}
        aria-hidden
      />
      {label}
    </span>
  );
}

function tooltip(info: PickingInfo) {
  const o = info.object as Record<string, unknown> | undefined;
  if (!o) return null;
  const box = (html: string) => ({ html, style: { background: "rgba(13,27,36,0.94)", color: "#efe9dd", fontFamily: "Schibsted Grotesk, ui-sans-serif, sans-serif", fontSize: "12px", padding: "8px 10px", borderRadius: "8px", maxWidth: "320px", lineHeight: "1.35" } });
  if (info.layer?.id === "stones") {
    const s = o as unknown as StoneDatum;
    return box(`<b>${escapeHtml(s.id)}</b> · ${escapeHtml(STATUS_LABEL[s.status])} · pin ${escapeHtml(s.pin)}<br/>${escapeHtml(s.why)}`);
  }
  if (info.layer?.id === "stores") return box(`<b>${escapeHtml(String(o.id))}</b> · existing store · pin ${escapeHtml(String(o.pin))}${o.year ? ` · opened ${escapeHtml(String(o.year))}` : ""}`);
  if (info.layer?.id === "slot-towers") {
    const b = o as unknown as BlockDatum;
    const word = { approved: "approved", conditional: "reserved (conditional)", open: "open, usable", ghost: "wanted, but no free pin" }[b.kind];
    return box(`<b>${escapeHtml(b.territory)}</b> · slot ${b.level + 1}: ${word}`);
  }
  if (info.layer?.id === "contested") return box(escapeHtml(String(o.label)));
  return null;
}
