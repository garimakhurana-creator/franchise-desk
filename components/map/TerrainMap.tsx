"use client";

// India in 3D relief (satellite imagery on elevation), masked to India only, with territories popping
// out as labelled callouts on poles. Native MapLibre layers so everything sits on the terrain.
// Optional by design: any fatal error calls onFail and the parent falls back to the table.
import { useEffect, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type Map as MLMap, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { RunResult, Status } from "@/lib/engine/types";
import { buildTerrainData, karnatakaBounds, worldMask, type Callout } from "@/lib/map/terrain";
import { escapeHtml } from "@/lib/map/data";

export interface TerrainMapProps {
  result: RunResult;
  selected: string | null;
  highlight: string[];
  onSelect: (key: string) => void;
  onPickTerritory: (key: string | null) => void;
  activeTerritory: string | null;
  theme: "light" | "dark";
  reducedMotion: boolean;
  onFail: (reason: string) => void;
  /** Deep-dive target: open the map here instead of playing the India intro. */
  focus?: [number, number] | null;
  /** How close the deep dive gets: about 10.6 for a territory, 14.5 for one applicant's pin. */
  focusZoom?: number;
}

const STATUS_HEX: Record<Status, string> = { APPROVED: "#2fbf8f", CONDITIONAL: "#4fc3d9", WAITLISTED: "#9aa6d3", ON_HOLD: "#e39a3b", DECLINED: "#e2685f", WITHDRAWN: "#8a989e" };
const STATUS_ORDER: Status[] = ["APPROVED", "CONDITIONAL", "WAITLISTED", "ON_HOLD", "DECLINED", "WITHDRAWN"];
// Opening shot: India tilted towards the Himalayas, then the camera flies south to Karnataka.
const INDIA_VIEW = { center: [79.5, 24.5] as [number, number], zoom: 4.05, pitch: 60, bearing: 12 };

function style(theme: "light" | "dark"): StyleSpecification {
  const mask = theme === "dark" ? "#0b1820" : "#e9e4d8";
  return {
    version: 8,
    sources: {
      dem: { type: "raster-dem", tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"], encoding: "terrarium", tileSize: 256, maxzoom: 13, attribution: "Elevation: Terrain Tiles (AWS Open Data, Mapzen)" },
      shade: { type: "raster-dem", tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"], encoding: "terrarium", tileSize: 256, maxzoom: 13 },
      sat: { type: "raster", tiles: ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg"], tileSize: 256, maxzoom: 14, attribution: "Imagery: Sentinel-2 cloudless by EOX (Copernicus Sentinel data 2020)" },
      streets: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: "Map data © OpenStreetMap contributors" },
      labels: { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 19, attribution: "Labels: Esri" },
      roads: { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 19 },
    },
    terrain: { source: "dem", exaggeration: 2.6 },
    sky: {
      "sky-color": theme === "dark" ? "#2a2236" : "#c9c4d6",
      "horizon-color": theme === "dark" ? "#6b5566" : "#efe3d6",
      "fog-color": theme === "dark" ? "#1a2230" : "#e8e1d6",
      "sky-horizon-blend": 0.6,
      "horizon-fog-blend": 0.2,
      "fog-ground-blend": 1,
      "atmosphere-blend": 0.3,
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": mask } },
      { id: "sat", type: "raster", source: "sat", paint: { "raster-saturation": -0.12, "raster-contrast": 0.08, "raster-brightness-max": theme === "dark" ? 0.88 : 1 } },
      { id: "streets", type: "raster", source: "streets", layout: { visibility: "none" }, paint: { "raster-brightness-min": 0.92, "raster-brightness-max": 0.08, "raster-hue-rotate": 180, "raster-saturation": -0.35, "raster-contrast": 0.1 } },
      { id: "shade", type: "hillshade", source: "shade", paint: { "hillshade-exaggeration": 0.8, "hillshade-shadow-color": "#0b0f14", "hillshade-highlight-color": "#fff6e6", "hillshade-accent-color": "#3a2f22" } },
    ],
  } as StyleSpecification;
}

export default function TerrainMap(props: TerrainMapProps) {
  const [mode, setMode] = useState<"satellite" | "map">("satellite");
  const [legend, setLegend] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const popup = useRef<maplibregl.Popup | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const ready = useRef(false);

  // ---------- create the map once ----------
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const test = document.createElement("canvas");
    if (!(test.getContext("webgl2") || test.getContext("webgl"))) {
      props.onFail("WebGL is not available");
      return;
    }
    let map: MLMap;
    try {
      // a deep dive opens straight at the territory, so only its tiles load
      const start = props.focus ? { center: props.focus, zoom: (props.focusZoom ?? 10.6) - 1, pitch: 50, bearing: -10 } : INDIA_VIEW;
      map = new maplibregl.Map({ container: el, style: style(props.theme), ...start, maxPitch: 72, maxZoom: 18, attributionControl: false, fadeDuration: 0 });
      // credits stay available behind an (i) button, collapsed so they never cover the console
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
      map.once("load", () => el.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"));
    } catch (e) {
      props.onFail(`map could not start (${(e as Error).message})`);
      return;
    }
    mapRef.current = map;
    if (process.env.NODE_ENV !== "production") (window as unknown as { __tmap?: MLMap }).__tmap = map; // dev inspection only
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.on("error", (e) => {
      // Tile hiccups are normal; only a broken style or context is fatal.
      const msg = String((e as { error?: Error }).error?.message ?? "");
      if (/style|webgl|context/i.test(msg) && !/tile|fetch|load|404|network/i.test(msg)) latest.current.onFail(msg.slice(0, 80));
    });
    el.addEventListener("webglcontextlost", () => latest.current.onFail("WebGL context lost"));
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el);

    map.on("load", async () => {
      try {
        const india = await fetch("/geo/india.json").then((r) => r.json());
        const indiaF = india.features.find((f: GeoJSON.Feature) => f.properties?.kind === "india");
        const ka = india.features.find((f: GeoJSON.Feature) => f.properties?.kind === "karnataka");
        const states = { type: "FeatureCollection", features: india.features.filter((f: GeoJSON.Feature) => f.properties?.kind === "state") };
        const dark = latest.current.theme === "dark";
        map.addSource("mask", { type: "geojson", data: worldMask(indiaF) });
        map.addSource("india", { type: "geojson", data: indiaF });
        map.addSource("ka", { type: "geojson", data: ka });
        map.addSource("states", { type: "geojson", data: states as GeoJSON.FeatureCollection });
        map.addLayer({ id: "roads", type: "raster", source: "roads", minzoom: 9, maxzoom: 15, paint: { "raster-opacity": 0.75 } });
        map.addLayer({ id: "labels", type: "raster", source: "labels", minzoom: 4.5, maxzoom: 15, paint: { "raster-opacity": 1 } });
        map.addLayer({ id: "mask", type: "fill", source: "mask", paint: { "fill-color": dark ? "#0b1820" : "#e9e4d8", "fill-opacity": 0.97 } });
        map.addLayer({ id: "states", type: "line", source: "states", paint: { "line-color": "#f5ecd8", "line-opacity": 0.22, "line-width": 0.6 } });
        map.addLayer({ id: "india-edge", type: "line", source: "india", paint: { "line-color": "#f5ecd8", "line-opacity": 0.75, "line-width": 1.2 } });
        map.addLayer({ id: "ka-glow", type: "line", source: "ka", paint: { "line-color": "#f2c14e", "line-opacity": 0.35, "line-width": 6, "line-blur": 5 } });
        map.addLayer({ id: "ka-edge", type: "line", source: "ka", paint: { "line-color": "#f2c14e", "line-opacity": 0.9, "line-width": 1.4 } });

        const data = buildTerrainData(latest.current.result);
        map.addSource("discs", { type: "geojson", data: data.discs });
        map.addSource("stores", { type: "geojson", data: data.stores });
        map.addSource("towers", { type: "geojson", data: data.towers });
        map.addSource("stones", { type: "geojson", data: data.stones });
        map.addSource("arcs", { type: "geojson", data: data.arcs });
        map.addLayer({ id: "discs", type: "fill", source: "discs", minzoom: 7, paint: { "fill-color": "#f5ecd8", "fill-opacity": 0.14, "fill-outline-color": "#f5ecd8" } });
        map.addLayer({
          id: "towers",
          type: "fill-extrusion",
          source: "towers",
          paint: {
            "fill-extrusion-color": ["match", ["get", "kind"], "approved", "#f2c14e", "conditional", "#f6d987", "open", "#fff3cf", "#8a8f94"],
            "fill-extrusion-opacity": 0.92,
            "fill-extrusion-base": ["get", "base"],
            "fill-extrusion-height": ["get", "top"],
          },
        });
        map.addLayer({ id: "arcs", type: "line", source: "arcs", paint: { "line-color": "#f2c14e", "line-width": 2.4, "line-dasharray": [2, 1.5] } });
        map.addLayer({ id: "stores", type: "circle", source: "stores", paint: { "circle-color": "#1b1f24", "circle-stroke-color": "#f5ecd8", "circle-stroke-width": 1.6, "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 2.5, 10, 6] } });
        map.addLayer({ id: "stone-halo", type: "circle", source: "stones", filter: ["in", ["get", "key"], ["literal", []]], paint: { "circle-color": "#f2c14e", "circle-opacity": 0.25, "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 9, 11, 20], "circle-blur": 0.4 } });
        map.addLayer({
          id: "stones",
          type: "circle",
          source: "stones",
          paint: {
            "circle-color": ["match", ["get", "status"], ...STATUS_ORDER.flatMap((s) => [s, STATUS_HEX[s]]), "#999"] as unknown as string,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 3.2, 8, 5, 12, 9],
            "circle-stroke-color": ["case", ["get", "locked"], "#fffbe8", "#10161c"],
            "circle-stroke-width": ["case", ["get", "locked"], 2, 1],
          },
        });

        map.on("mouseenter", "stones", () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", "stones", () => (map.getCanvas().style.cursor = ""));
        map.on("click", "stones", (e) => {
          const f = e.features?.[0];
          if (f?.properties?.key) latest.current.onSelect(String(f.properties.key));
        });
        map.on("mousemove", "stones", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          popup.current?.remove();
          popup.current = new maplibregl.Popup({ closeButton: false, offset: 12, className: "tm-pop" })
            .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
            .setHTML(`<b>${escapeHtml(String(f.properties?.id))}</b> · ${escapeHtml(String(f.properties?.status).replace("_", " ").toLowerCase())}<br>${escapeHtml(String(f.properties?.why))}`)
            .addTo(map);
        });
        map.on("mouseleave", "stones", () => popup.current?.remove());

        let pending = false;
        map.on("move", () => {
          if (pending) return;
          pending = true;
          setTimeout(() => {
            pending = false;
            layoutCallouts(map);
          }, 120);
        });
        map.on("moveend", () => layoutCallouts(map));
        // dramatic relief at state level, close to true relief at street level (labels stay readable)
        let ex = 2.6;
        map.on("zoomend", () => {
          const z = map.getZoom();
          const next = z >= 12 ? 1 : z >= 9 ? 1.6 : 2.6;
          if (next !== ex) {
            ex = next;
            map.setTerrain({ source: "dem", exaggeration: next });
          }
        });
        ready.current = true;
        drawCallouts(map, data.callouts);
        intro(map);
        watchFps(map);
      } catch (e) {
        latest.current.onFail(`map data could not load (${(e as Error).message})`);
      }
    });
    return () => {
      ro.disconnect();
      markers.current.forEach((m) => m.remove());
      markers.current = [];
      map.remove();
      mapRef.current = null;
      ready.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.theme]);

  // ---------- data changes (follow-ups) ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    const data = buildTerrainData(props.result);
    (map.getSource("stones") as GeoJSONSource | undefined)?.setData(data.stones);
    (map.getSource("towers") as GeoJSONSource | undefined)?.setData(data.towers);
    (map.getSource("arcs") as GeoJSONSource | undefined)?.setData(data.arcs);
    drawCallouts(map, data.callouts, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.result]);

  // ---------- highlight and selection ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    const keys = [...props.highlight, ...(props.selected ? [props.selected] : [])];
    map.setFilter("stone-halo", ["in", ["get", "key"], ["literal", keys]]);
    if (props.selected) {
      const f = buildTerrainData(props.result).stones.features.find((x) => x.properties?.key === props.selected);
      if (f) {
        const to = { center: f.geometry.coordinates as [number, number], zoom: Math.max(map.getZoom(), 13), pitch: 55 };
        if (props.reducedMotion) map.jumpTo(to);
        else map.easeTo({ ...to, duration: 1400 });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.selected, props.highlight]);

  useEffect(() => {
    for (const m of markers.current) m.getElement().classList.toggle("is-active", m.getElement().dataset.key === props.activeTerritory);
  }, [props.activeTerritory]);

  // a new deep-dive target while the map is open: fly there
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current || !props.focus) return;
    const to = { center: props.focus, zoom: props.focusZoom ?? Math.max(10.6, map.getZoom()), pitch: 55 };
    if (props.reducedMotion) map.jumpTo(to);
    else map.flyTo({ ...to, duration: 1800, essential: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.focus?.[0], props.focus?.[1], props.focusZoom]);

  // Tags that would overlap rise to different heights, like peak labels on taller poles.
  function layoutCallouts(map: MLMap) {
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const items = markers.current.map((m) => ({ m, p: map.project(m.getLngLat()) })).sort((a, b) => b.p.y - a.p.y || a.p.x - b.p.x);
    for (const { m, p } of items) {
      const el = m.getElement();
      const tag = el.querySelector<HTMLElement>(".tm-tag");
      const pole = el.querySelector<HTMLElement>(".tm-pole");
      if (!tag || !pole) continue;
      const w = tag.offsetWidth;
      const h = tag.offsetHeight;
      const box = map.getContainer();
      const top = 8;
      const maxX = box.clientWidth - 8;
      let best: { L: number; dx: number; r: { x: number; y: number; w: number; h: number } } | null = null;
      // try short poles first, sliding the tag left or right off its pole before climbing higher
      outer: for (const L of [40, 88, 136, 184, 232]) {
        for (const dx of [0, -0.55 * w, 0.55 * w, -w, w]) {
          const r = { x: p.x - w / 2 + dx - 4, y: p.y - L - h - 10, w: w + 8, h: h + 6 };
          if (r.y < top || r.x < 4 || r.x + r.w > maxX) continue;
          if (!placed.some((q) => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y)) {
            best = { L, dx, r };
            break outer;
          }
        }
      }
      if (!best) best = { L: 40, dx: 0, r: { x: p.x - w / 2, y: p.y - 40 - h, w, h } };
      placed.push(best.r);
      pole.style.height = `${best.L}px`;
      tag.style.left = `${Math.round(best.dx)}px`;
    }
  }

  function switchMode(next: "satellite" | "map") {
    setMode(next);
    const map = mapRef.current;
    if (!map || !ready.current) return;
    map.setLayoutProperty("sat", "visibility", next === "satellite" ? "visible" : "none");
    map.setLayoutProperty("shade", "visibility", next === "satellite" ? "visible" : "none");
    map.setLayoutProperty("streets", "visibility", next === "map" ? "visible" : "none");
    map.setLayoutProperty("labels", "visibility", next === "satellite" ? "visible" : "none");
    map.setLayoutProperty("roads", "visibility", next === "satellite" ? "visible" : "none");
  }

  function drawCallouts(map: MLMap, callouts: Callout[], update = false) {
    markers.current.forEach((m) => m.remove());
    markers.current = [];
    callouts.forEach((c, i) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = `tm-callout${c.noTerritory ? " is-orphan" : ""}${update ? " no-pop" : ""}${latest.current.activeTerritory === c.key ? " is-active" : ""}`;
      el.dataset.key = c.key;
      el.style.setProperty("--d", `${latest.current.reducedMotion ? 0 : 0.35 + i * 0.12}s`);
      el.setAttribute("aria-label", `${c.title} ${c.place}: ${c.requests} requests${c.noTerritory ? ", no territory" : `, ${c.used} of ${c.capacity} usable slots filled`}`);
      const total = Math.max(1, c.requests);
      const bar = STATUS_ORDER.filter((s) => c.counts[s]).map((s) => `<i style="flex:${c.counts[s]};background:${STATUS_HEX[s]}" title="${s}: ${c.counts[s]}"></i>`).join("");
      const slots = c.noTerritory ? "no open territory" : `${c.used}/${c.capacity} slots${c.wanted > c.capacity ? ` · ${c.wanted} wanted` : ""}`;
      el.innerHTML = `<span class="tm-tag"><span class="tm-title"><b>${escapeHtml(c.title)}</b> ${escapeHtml(c.place)}</span><span class="tm-sub"><span class="tm-req">${c.requests}</span> request${c.requests === 1 ? "" : "s"} · ${escapeHtml(slots)}</span><span class="tm-bar">${bar || `<i style="flex:${total};background:#8a989e"></i>`}</span></span><span class="tm-pole"></span><span class="tm-foot"></span>`;
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const cur = latest.current.activeTerritory;
        latest.current.onPickTerritory(cur === c.key || c.noTerritory ? null : c.key);
        const to = { center: c.lngLat, zoom: 10.6, pitch: 55, bearing: map.getBearing() };
        if (latest.current.reducedMotion) map.jumpTo(to);
        else map.flyTo({ ...to, duration: 1800, essential: true });
      });
      const m = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat(c.lngLat).addTo(map);
      markers.current.push(m);
    });
    requestAnimationFrame(() => layoutCallouts(map));
  }

  function intro(map: MLMap) {
    const f = latest.current.focus;
    if (f && map.getContainer().clientHeight >= 80) {
      map.resize();
      const to = { center: f, zoom: latest.current.focusZoom ?? 10.6, pitch: 55, bearing: -10 };
      if (latest.current.reducedMotion) map.jumpTo(to);
      else {
        map.jumpTo({ center: f, zoom: 7.2, pitch: 40, bearing: 0 });
        map.flyTo({ ...to, duration: 2200, essential: true });
      }
      return;
    }
    if (map.getContainer().clientHeight < 80) {
      // the column has not been laid out yet; try again shortly
      setTimeout(() => intro(map), 150);
      return;
    }
    map.resize();
    const b = karnatakaBounds(latest.current.result);
    const cam = map.cameraForBounds(b, { padding: { top: 140, bottom: 40, left: 40, right: 40 } });
    const to = { center: cam?.center ?? [76.2, 14.6], zoom: Math.min(7.2, (cam?.zoom ?? 6.5) + 0.2), pitch: 58, bearing: -16 };
    if (latest.current.reducedMotion) {
      map.jumpTo(to);
      return;
    }
    // Hold on India until its tiles have arrived (at most 6 s), then fly into Karnataka.
    let flown = false;
    const go = () => {
      if (flown || !mapRef.current) return;
      flown = true;
      map.flyTo({ ...to, duration: 4600, curve: 1.4, essential: true });
    };
    map.once("idle", () => setTimeout(go, 1400));
    setTimeout(go, 6000);
  }

  function watchFps(map: MLMap) {
    let frames = 0;
    let slow = 0;
    let last = performance.now();
    const tick = () => {
      if (!mapRef.current) return;
      frames++;
      const now = performance.now();
      if (now - last >= 1000) {
        const fps = (frames * 1000) / (now - last);
        slow = map.isMoving() && fps < 12 ? slow + 1 : 0;
        if (slow >= 5) {
          latest.current.onFail(`frame rate too low (${Math.round(fps)} fps)`);
          return;
        }
        frames = 0;
        last = now;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  return (
    <div className="relative h-full w-full">
      {/* inline position: MapLibre adds its own position:relative class to the container */}
      <div ref={box} style={{ position: "absolute", inset: 0 }} />
      <div className="absolute left-3 top-3 z-[2] flex overflow-hidden rounded-md border border-white/10 bg-[#0c131c]/90 text-[12px] font-medium shadow-lg" role="group" aria-label="Base map">
        {(["satellite", "map"] as const).map((m) => (
          <button key={m} type="button" onClick={() => switchMode(m)} aria-pressed={mode === m} className={`px-3 py-1.5 capitalize transition-colors ${mode === m ? "bg-white/12 text-white" : "text-white/60 hover:text-white"}`}>
            {m}
          </button>
        ))}
      </div>
      <div className="absolute bottom-3 left-3 z-[2] max-w-[300px] text-[11.5px] leading-snug">
        {legend && (
          <div className="tm-legend mb-2 rounded-md px-3 py-2">
            <div className="flex flex-wrap gap-x-2.5 gap-y-1">
              {STATUS_ORDER.slice(0, 5).map((st) => (
                <span key={st} className="inline-flex items-center gap-1">
                  <i className="inline-block size-2 rounded-full" style={{ background: STATUS_HEX[st] }} />
                  {st === "ON_HOLD" ? "On hold" : st.charAt(0) + st.slice(1).toLowerCase()}
                </span>
              ))}
            </div>
            <div className="mt-1 opacity-80">Gold blocks: slots (solid filled, pale open, grey blocked by pins). Rings: our stores with 2 km catchment.</div>
            <div className="mt-0.5 opacity-60">Pin centres approximate; no catchment boundaries provided. Relief exaggerated 2.6×.</div>
          </div>
        )}
        <button type="button" onClick={() => setLegend((v) => !v)} aria-expanded={legend} className="rounded-md border border-white/10 bg-[#0c131c]/90 px-2.5 py-1 text-[12px] text-white/75 shadow-lg hover:text-white">
          {legend ? "Hide legend" : "Legend"}
        </button>
      </div>
    </div>
  );
}
