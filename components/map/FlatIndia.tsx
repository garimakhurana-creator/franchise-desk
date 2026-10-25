"use client";
// Flat India: the same satellite picture and pins as the 3D view, drawn with plain HTML and CSS.
// Used when the browser has no WebGL (hardware acceleration off, locked-down machines), so the map never goes blank.
import { useEffect, useState } from "react";
import type { MapPoint } from "@/lib/map/terrain";

type Meta = { zoom: number; mercPx: [number, number, number, number]; texture: { w: number; h: number } };

const mercX = (lng: number, z: number) => ((lng + 180) / 360) * 2 ** z * 256;
const mercY = (lat: number, z: number) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z * 256;
};

export default function FlatIndia({ points, activeKey, onPick }: { points: MapPoint[]; activeKey?: string | null; onPick: (key: string) => void }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  useEffect(() => {
    fetch("/diorama/meta.json")
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => {});
  }, []);
  if (!meta) return null;
  const [x0, y0, x1, y1] = meta.mercPx;
  const placed = points.map((p) => ({ p, fx: (mercX(p.lngLat[0], meta.zoom) - x0) / (x1 - x0), fy: (mercY(p.lngLat[1], meta.zoom) - y0) / (y1 - y0) }));
  // frame the pins: a window of the picture around them (same aspect), so a tight cluster is readable
  const fxs = placed.map((x) => x.fx);
  const fys = placed.map((x) => x.fy);
  const spread = placed.length ? Math.max(Math.max(...fxs) - Math.min(...fxs), Math.max(...fys) - Math.min(...fys)) : 1;
  const crop = Math.min(1, Math.max(0.34, spread * 2.6));
  const cx = placed.length ? (Math.max(...fxs) + Math.min(...fxs)) / 2 : 0.5;
  const cy = placed.length ? (Math.max(...fys) + Math.min(...fys)) / 2 : 0.5;
  const ox = Math.min(1 - crop, Math.max(0, cx - crop / 2));
  const oy = Math.min(1 - crop, Math.max(0, cy - crop / 2));
  const at = (f: number, o: number) => `${((f - o) / crop) * 100}%`;
  // labels go west or east of their pin so neighbours do not stack on one side
  const byLat = [...placed].sort((a, b) => a.fy - b.fy);
  const flip = new Set(byLat.filter((_, i) => i % 2 === 1).map((x) => x.p.key));
  return (
    <div className="absolute inset-0 grid place-items-center overflow-hidden p-4">
      <div className="relative h-full max-h-full max-w-full overflow-hidden" style={{ aspectRatio: `${meta.texture.w} / ${meta.texture.h}` }}>
        <img
          src="/diorama/sat.jpg"
          alt="Satellite map of India"
          className="absolute max-w-none select-none"
          draggable={false}
          style={{ width: `${100 / crop}%`, height: `${100 / crop}%`, left: `${(-ox / crop) * 100}%`, top: `${(-oy / crop) * 100}%`, WebkitMaskImage: "url(/diorama/mask-alpha.png)", maskImage: "url(/diorama/mask-alpha.png)", WebkitMaskSize: "100% 100%", maskSize: "100% 100%", filter: "drop-shadow(0 18px 30px #000c)" }}
        />
        {placed.map(({ p, fx, fy }) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onPick(p.key)}
            aria-label={`${p.title}, ${p.place}${p.count !== undefined ? `: ${p.count} new request${p.count === 1 ? "" : "s"}` : ""}. Open`}
            className={`dio-tag${flip.has(p.key) ? " flip" : ""}${p.muted ? " is-orphan" : ""}${activeKey === p.key ? " is-active" : ""}`}
            style={{ left: at(fx, ox), top: at(fy, oy), transform: flip.has(p.key) ? "translate(calc(-100% + 12px), -32px)" : "translate(-12px, -32px)", animation: "none" }}
          >
            <span className="dp-pin">
              <span className="dp-head">
                <span className="dp-num">{p.count !== undefined ? p.count : ""}</span>
              </span>
              <span className="dp-pulse" />
            </span>
            <span className="dp-name">
              <b>{p.title}</b> {p.place}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
