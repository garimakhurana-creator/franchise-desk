"use client";

// Terrain dioramas in three.js, all in one style: satellite colour on raised relief, sandstone walls, a dark stage.
// - india: the whole country cut to its outline (assets baked once by scripts/bake_diorama.py)
// - region: a baked close-up slab of the territory region
// - area: a slab of one territory, built in the browser from public elevation and imagery tiles, so clicking a
//   territory zooms into the same kind of map instead of switching to a different one
// Pins are HTML (neon teardrops with names); pin areas and service rings are drawn onto the terrain itself.
// Any failure calls onFail and the parent shows the flat map.
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { MapPoint } from "@/lib/map/terrain";
import { escapeHtml } from "@/lib/map/data";

export type DioramaSource = { kind: "india" } | { kind: "region" } | { kind: "area"; bbox: [number, number, number, number] };

export interface DioramaProps {
  points: MapPoint[];
  activeKey?: string | null;
  onPick: (key: string) => void;
  reducedMotion: boolean;
  onFail: (reason: string) => void;
  hint?: string;
  /** Slowly swing the view while nobody is touching it. */
  autoRotate?: boolean;
  source?: DioramaSource;
  /** Polygons and lines drawn onto the terrain (pin areas, service ring, line to the nearest store). */
  overlay?: GeoJSON.FeatureCollection | null;
  /** Fly the camera to this place (for example the request being reviewed). */
  focus?: [number, number] | null;
  /** Called once the model is on screen. */
  onReady?: () => void;
}

interface Meta {
  mercPx: [number, number, number, number];
  zoom: number;
  height: { w: number; h: number };
}

const WIDTH = 10; // world units across the model (before any stretch)
const MODES = {
  india: { ex: 30, base: -0.34, step: 2, strata: 40, seg: 1 },
  region: { ex: 7, base: -1.1, step: 1, strata: 7, seg: 1 },
  area: { ex: 3, base: -0.5, step: 1, strata: 7, seg: 1 },
};
// Backdrop: forested ridges fading into a green evening haze, so the stage blends with the terrain (drawn here, no photo)
const ridge = (y: number, amp: number, f1: number, f2: number, ph: number) => {
  let d = "M0 900 L0 " + y;
  for (let x = 0; x <= 1600; x += 20) d += " L" + x + " " + (y - amp * (0.55 * Math.sin(x / f1 + ph) + 0.3 * Math.sin(x / f2 + ph * 2) + 0.15 * Math.sin(x / 37 + ph * 3))).toFixed(1);
  return d + " L1600 900 Z";
};
const BACKDROP =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice">' +
      '<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#060c0a"/><stop offset="0.45" stop-color="#0f1f19"/><stop offset="0.7" stop-color="#1c3428"/><stop offset="0.86" stop-color="#2f4a33"/></linearGradient>' +
      '<radialGradient id="g" cx="0.5" cy="0.78" r="0.6"><stop offset="0" stop-color="#d8c58a" stop-opacity="0.22"/><stop offset="1" stop-color="#d8c58a" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#07070b" stop-opacity="0"/><stop offset="1" stop-color="#07070b"/></linearGradient></defs>' +
      '<rect width="1600" height="900" fill="url(#s)"/><rect width="1600" height="900" fill="url(#g)"/>' +
      '<path d="' + ridge(560, 150, 210, 90, 1) + '" fill="#3b5a43" opacity="0.55"/>' +
      '<path d="' + ridge(620, 120, 160, 70, 2.3) + '" fill="#2a4532" opacity="0.75"/>' +
      '<path d="' + ridge(690, 95, 130, 55, 4.1) + '" fill="#1a2e21" opacity="0.9"/>' +
      '<path d="' + ridge(760, 70, 110, 45, 5.7) + '" fill="#0f1c14"/>' +
      '<rect y="620" width="1600" height="280" fill="url(#h)"/></svg>',
  );
const AREA_COLORS: Record<string, string> = { applicant: "#8f7cff", free: "#3cf2c0", rival: "#f5a524", store: "#f87171", taken: "#9aa3b2" };

/** A sandstone cliff texture: wavy layers of warm tones with grain and darker seams, tiled along the walls. */
function strataTexture(): THREE.CanvasTexture {
  const S = 512;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const img = g.createImageData(S, S);
  const tones = [[176, 142, 104], [140, 108, 76], [201, 170, 128], [118, 90, 64], [160, 128, 92], [190, 156, 116], [104, 80, 58], [168, 136, 98]];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const bands: number[] = [];
  for (let y = 0, i = 0; y < S; i++) {
    const h = 6 + Math.floor(rnd() * 26);
    for (let k = 0; k < h && y < S; k++, y++) bands[y] = i;
  }
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      // layers undulate gently along the cliff, as in folded sediment (periodic so the texture tiles)
      const wave = Math.sin((x / S) * Math.PI * 4) * 7 + Math.sin((x / S) * Math.PI * 10 + y * 0.02) * 2.5;
      const yy = (((y + Math.round(wave)) % S) + S) % S;
      const b = bands[yy];
      const t = tones[b % tones.length];
      const edge = bands[(yy + 1) % S] !== b ? 0.72 : 1; // a dark seam between layers
      const grain = 0.86 + rnd() * 0.22;
      const o = (y * S + x) * 4;
      img.data[o] = t[0] * grain * edge;
      img.data[o + 1] = t[1] * grain * edge;
      img.data[o + 2] = t[2] * grain * edge;
      img.data[o + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => rej(new Error(`could not load ${src}`));
    img.src = src;
  });
}

function pixels(img: CanvasImageSource, w: number, h: number): Uint8ClampedArray {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.imageSmoothingEnabled = false; // heights are colour-encoded: blending neighbours would invent spikes
  g.drawImage(img, 0, 0, w, h);
  return g.getImageData(0, 0, w, h).data;
}

function mercX(lng: number, z: number) {
  return ((lng + 180) / 360) * 2 ** z * 256;
}
function mercY(lat: number, z: number) {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z * 256;
}

/** Stitch the tiles covering a bbox at zoom z (pixel window given at zoom zRef) into one canvas. */
async function stitch(url: (z: number, x: number, y: number) => string, z: number, px: [number, number, number, number], zRef: number, outW: number, outH: number, smooth = true) {
  const k = 2 ** (z - zRef);
  const [x0, y0, x1, y1] = px.map((v) => v * k);
  const tx0 = Math.floor(x0 / 256), ty0 = Math.floor(y0 / 256), tx1 = Math.floor(x1 / 256), ty1 = Math.floor(y1 / 256);
  const full = document.createElement("canvas");
  full.width = (tx1 - tx0 + 1) * 256;
  full.height = (ty1 - ty0 + 1) * 256;
  const g = full.getContext("2d")!;
  const jobs: Promise<void>[] = [];
  for (let tx = tx0; tx <= tx1; tx++)
    for (let ty = ty0; ty <= ty1; ty++)
      jobs.push(loadImage(url(z, tx, ty)).then((img) => g.drawImage(img, (tx - tx0) * 256, (ty - ty0) * 256, 256, 256)));
  const done = await Promise.allSettled(jobs);
  if (done.filter((d) => d.status === "rejected").length > jobs.length / 3) throw new Error("map tiles could not load");
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const og = out.getContext("2d")!;
  og.imageSmoothingEnabled = smooth;
  og.drawImage(full, x0 - tx0 * 256, y0 - ty0 * 256, x1 - x0, y1 - y0, 0, 0, outW, outH);
  return out;
}

/** Everything a slab needs: the pixel window, a terrarium heightmap, the satellite texture and an optional mask. */
async function loadSource(src: DioramaSource): Promise<{ meta: Meta; height: CanvasImageSource; mask: CanvasImageSource | null; sat: CanvasImageSource }> {
  if (src.kind !== "area") {
    const dir = src.kind === "india" ? "/diorama/" : "/diorama/region/";
    const meta: Meta = await fetch(`${dir}meta.json`).then((r) => r.json());
    const [height, mask, sat] = await Promise.all([loadImage(`${dir}height.png`), loadImage(`${dir}mask.png`), loadImage(`${dir}sat.jpg`)]);
    return { meta, height, mask: src.kind === "india" ? mask : null, sat };
  }
  const [w, s, e, n] = src.bbox;
  // imagery about 1600 px across (Sentinel-2 is sharp to about zoom 13); elevation two levels coarser
  const zImg = Math.max(8, Math.min(13, Math.floor(Math.log2((1600 * 360) / (256 * (e - w))))));
  const zDem = Math.max(6, zImg - 2);
  const px: [number, number, number, number] = [mercX(w, zImg), mercY(n, zImg), mercX(e, zImg), mercY(s, zImg)];
  const tw = Math.round(px[2] - px[0]);
  const th = Math.round(px[3] - px[1]);
  const hw = 400;
  const hh = Math.round((th * hw) / tw);
  const [height, sat] = await Promise.all([
    stitch((z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`, zDem, px, zImg, hw, hh, false),
    stitch((z, x, y) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/${z}/${y}/${x}.jpg`, zImg, px, zImg, tw, th),
  ]);
  return { meta: { mercPx: px, zoom: zImg, height: { w: hw, h: hh } }, height, mask: null, sat };
}

export default function Diorama({ points, activeKey, onPick, reducedMotion, onFail, hint, autoRotate, source = { kind: "india" }, overlay, focus, onReady }: DioramaProps) {
  const host = useRef<HTMLDivElement>(null);
  const tagLayer = useRef<HTMLDivElement>(null);
  const lineLayer = useRef<SVGSVGElement>(null);
  const latest = useRef({ points, onPick, onFail, activeKey, autoRotate, overlay, focus, onReady });
  latest.current = { points, onPick, onFail, activeKey, autoRotate, overlay, focus, onReady };
  const api = useRef<{ setCallouts: (c: MapPoint[]) => void; setActive: (k: string | null | undefined) => void; setOverlay: (o: GeoJSON.FeatureCollection | null | undefined) => void; flyTo: (p: [number, number] | null | undefined) => void } | null>(null);
  const sourceKey = JSON.stringify(source);

  useEffect(() => {
    const el = host.current;
    const layer = tagLayer.current;
    const lines = lineLayer.current;
    if (!el || !layer || !lines) return;
    let disposed = false;
    let raf = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    const cleanups: (() => void)[] = [];

    (async () => {
      try {
        const test = document.createElement("canvas");
        const probe = (test.getContext("webgl2") || test.getContext("webgl")) as WebGLRenderingContext | null;
        if (!probe) throw new Error("WebGL is not available");
        // software rendering (no GPU) cannot keep a detailed 3D scene smooth: the flat map is faster and clearer there
        const info = probe.getExtension("WEBGL_debug_renderer_info");
        const gpu = info ? String(probe.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
        probe.getExtension("WEBGL_lose_context")?.loseContext();
        if (/swiftshader|llvmpipe|software|basic render/i.test(gpu)) throw new Error(`software rendering (${gpu.slice(0, 40)})`);
        const kind = source.kind;
        const M = MODES[kind];
        const narrow = el.clientWidth < 640;
        const EXAGGERATION = M.ex;
        const BASE_Y = M.base;
        const STEP = kind !== "india" && narrow ? 2 : M.step; // lighter mesh on phones
        const { meta, height, mask, sat: satImg } = await loadSource(source);
        if (disposed) return;
        const W = meta.height.w;
        const H = meta.height.h;
        const hp = pixels(height, W, H);
        const mp = mask ? pixels(mask, W, H) : null;
        const elev = (x: number, y: number) => {
          const i = (Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))) * 4;
          const m = hp[i] * 256 + hp[i + 1] + hp[i + 2] / 256 - 32768;
          return Math.max(0, m);
        };
        const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && (!mp || mp[(y * W + x) * 4] > 127);
        // India is taller than wide: on wide screens stretch it sideways a little so it fills the stage
        const aspect = el.clientWidth / Math.max(1, el.clientHeight);
        const SX = kind === "india" && !narrow ? Math.min(1.45, Math.max(1, aspect / 1.25)) : 1;
        const depth = (WIDTH * H) / W;
        const scaleY = (WIDTH / (((meta.mercPx[2] - meta.mercPx[0]) * 40075016) / (2 ** meta.zoom * 256))) * EXAGGERATION; // world units per metre
        const toWorld = (px: number, py: number, m: number) => new THREE.Vector3((px / W - 0.5) * WIDTH * SX, m * scaleY, (py / H - 0.5) * depth);

        // ---- top surface ----
        const cols = Math.floor((W - 1) / STEP) + 1;
        const rows = Math.floor((H - 1) / STEP) + 1;
        const pos = new Float32Array(cols * rows * 3);
        const uv = new Float32Array(cols * rows * 2);
        const isIn = new Uint8Array(cols * rows);
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < cols; c++) {
            const px = c * STEP;
            const py = r * STEP;
            const v = toWorld(px, py, elev(px, py));
            const k = r * cols + c;
            pos.set([v.x, v.y, v.z], k * 3);
            uv.set([px / (W - 1), 1 - py / (H - 1)], k * 2);
            isIn[k] = inside(px, py) ? 1 : 0;
          }
        const cellIn = (c: number, r: number) => c >= 0 && r >= 0 && c < cols - 1 && r < rows - 1 && isIn[r * cols + c] && isIn[r * cols + c + 1] && isIn[(r + 1) * cols + c] && isIn[(r + 1) * cols + c + 1];
        const idx: number[] = [];
        for (let r = 0; r < rows - 1; r++)
          for (let c = 0; c < cols - 1; c++) {
            if (!cellIn(c, r)) continue;
            const a = r * cols + c;
            const b = a + 1;
            const d = a + cols;
            const e = d + 1;
            idx.push(a, d, b, b, d, e);
          }
        const top = new THREE.BufferGeometry();
        top.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        top.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
        top.setIndex(idx);
        top.computeVertexNormals();
        const sat = new THREE.Texture(satImg as HTMLImageElement);
        sat.needsUpdate = true;
        sat.colorSpace = THREE.SRGBColorSpace;
        sat.anisotropy = 8;

        // ---- sandstone walls and base along every outside edge ----
        const wpos: number[] = [];
        const wcol: number[] = [];
        const wuv: number[] = [];
        const sand = new THREE.Color("#caa676");
        const deep = new THREE.Color("#5a3f27");
        const white = new THREE.Color("#ffffff");
        const pushV = (x: number, y: number, z: number) => {
          wpos.push(x, y, z);
          // the cliff texture runs along the wall; light falls off towards the base
          wuv.push((x + z) * 0.32, (y - BASE_Y) * (M.strata / 7));
          const t = Math.min(1, Math.max(0, (y - BASE_Y) / (0.06 - BASE_Y)));
          const col = deep.clone().lerp(sand, 0.35 + t * 0.65).lerp(white, 0.45 + t * 0.4);
          wcol.push(col.r, col.g, col.b);
        };
        const wall = (k1: number, k2: number) => {
          const [x1, y1, z1] = [pos[k1 * 3], pos[k1 * 3 + 1], pos[k1 * 3 + 2]];
          const [x2, y2, z2] = [pos[k2 * 3], pos[k2 * 3 + 1], pos[k2 * 3 + 2]];
          for (let i = 0; i < M.seg; i++) {
            const a1 = y1 + ((BASE_Y - y1) * i) / M.seg, b1 = y1 + ((BASE_Y - y1) * (i + 1)) / M.seg;
            const a2 = y2 + ((BASE_Y - y2) * i) / M.seg, b2 = y2 + ((BASE_Y - y2) * (i + 1)) / M.seg;
            pushV(x1, a1, z1); pushV(x1, b1, z1); pushV(x2, a2, z2);
            pushV(x2, a2, z2); pushV(x1, b1, z1); pushV(x2, b2, z2);
          }
        };
        const basePos: number[] = [];
        for (let r = 0; r < rows - 1; r++)
          for (let c = 0; c < cols - 1; c++) {
            if (!cellIn(c, r)) continue;
            const a = r * cols + c;
            if (!cellIn(c, r - 1)) wall(a, a + 1);
            if (!cellIn(c, r + 1)) wall(a + cols + 1, a + cols);
            if (!cellIn(c - 1, r)) wall(a + cols, a);
            if (!cellIn(c + 1, r)) wall(a + 1, a + cols + 1);
            const x0 = pos[a * 3], z0 = pos[a * 3 + 2], x1 = pos[(a + 1) * 3], z1 = pos[(a + cols) * 3 + 2];
            basePos.push(x0, BASE_Y, z0, x1, BASE_Y, z0, x0, BASE_Y, z1, x1, BASE_Y, z0, x1, BASE_Y, z1, x0, BASE_Y, z1);
          }
        const walls = new THREE.BufferGeometry();
        walls.setAttribute("position", new THREE.Float32BufferAttribute(wpos, 3));
        walls.setAttribute("color", new THREE.Float32BufferAttribute(wcol, 3));
        walls.setAttribute("uv", new THREE.Float32BufferAttribute(wuv, 2));
        const cliff = strataTexture();
        walls.computeVertexNormals();
        const base = new THREE.BufferGeometry();
        base.setAttribute("position", new THREE.Float32BufferAttribute(basePos, 3));

        // ---- scene ----
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
        renderer.setSize(el.clientWidth, el.clientHeight);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        el.appendChild(renderer.domElement);
        renderer.domElement.addEventListener("webglcontextlost", () => latest.current.onFail("WebGL context lost"));

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(32, el.clientWidth / el.clientHeight, 0.02, 100);
        scene.add(new THREE.HemisphereLight("#cfe0ff", "#3b2a1a", 0.9));
        const sun = new THREE.DirectionalLight("#fff1dc", 2.4);
        sun.position.set(-6, 9, -4); // from the north-west, so slopes facing south-east catch light
        scene.add(sun);
        scene.add(new THREE.Mesh(top, new THREE.MeshStandardMaterial({ map: sat, roughness: 0.92, metalness: 0 })));
        scene.add(new THREE.Mesh(walls, new THREE.MeshStandardMaterial({ map: cliff, vertexColors: true, roughness: 1, side: THREE.DoubleSide })));
        scene.add(new THREE.Mesh(base, new THREE.MeshBasicMaterial({ color: "#2a1d12", side: THREE.DoubleSide })));
        // soft contact shadow under the model
        const sh = document.createElement("canvas");
        sh.width = sh.height = 256;
        const g = sh.getContext("2d")!;
        const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128);
        grad.addColorStop(0, "rgba(0,0,0,0.75)");
        grad.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = grad;
        g.fillRect(0, 0, 256, 256);
        const shadow = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH * SX * 1.25, depth * 1.2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sh), transparent: true, depthWrite: false }));
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = BASE_Y - 0.12;
        scene.add(shadow);

        // ---- overlay drawn onto the terrain: pin areas, service ring, nearest-store line ----
        const satW = (satImg as HTMLImageElement).width || 2048;
        const satH = (satImg as HTMLImageElement).height || 2048;
        const ov = document.createElement("canvas");
        const ovScale = Math.min(1, 2048 / Math.max(satW, satH));
        ov.width = Math.round(satW * ovScale);
        ov.height = Math.round(satH * ovScale);
        const ovTex = new THREE.CanvasTexture(ov);
        ovTex.colorSpace = THREE.SRGBColorSpace;
        ovTex.anisotropy = 8;
        const ovMesh = new THREE.Mesh(top, new THREE.MeshBasicMaterial({ map: ovTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
        ovMesh.renderOrder = 2;
        scene.add(ovMesh);
        const toCanvas = (lng: number, lat: number): [number, number] => [((mercX(lng, meta.zoom) - meta.mercPx[0]) / (meta.mercPx[2] - meta.mercPx[0])) * ov.width, ((mercY(lat, meta.zoom) - meta.mercPx[1]) / (meta.mercPx[3] - meta.mercPx[1])) * ov.height];
        const setOverlay = (fc: GeoJSON.FeatureCollection | null | undefined) => {
          const c = ov.getContext("2d")!;
          c.clearRect(0, 0, ov.width, ov.height);
          const lw = Math.max(2, ov.width / 500);
          // territory zones are drawn inside the state outline (clip), as soft tinted areas with glowing borders
          const clip = fc?.features.find((f) => f.properties?.kind === "zone-clip");
          const zones = fc?.features.filter((f) => f.properties?.kind === "zone") ?? [];
          const ringsOf = (geom: GeoJSON.Geometry): GeoJSON.Position[][] => (geom.type === "Polygon" ? [geom.coordinates[0]] : geom.type === "MultiPolygon" ? geom.coordinates.map((p) => p[0]) : []);
          const path = (rings: GeoJSON.Position[][]) => {
            c.beginPath();
            for (const ring of rings)
              ring.forEach(([lng, lat], i) => {
                const [x, y] = toCanvas(lng, lat);
                if (i) c.lineTo(x, y);
                else c.moveTo(x, y);
              });
          };
          if (zones.length) {
            c.save();
            if (clip) {
              path(ringsOf(clip.geometry));
              c.clip();
            }
            zones.forEach((z, i) => {
              path(ringsOf(z.geometry).slice(0, 1));
              c.closePath();
              c.fillStyle = i % 2 ? "#8f7cff24" : "#3cf2c01e";
              c.fill();
              c.shadowColor = "#b4a6ff";
              c.shadowBlur = lw * 4;
              c.strokeStyle = "#d9d2ffee";
              c.lineWidth = lw * 1.1;
              c.stroke();
              c.shadowBlur = 0;
            });
            c.restore();
            if (clip) {
              path(ringsOf(clip.geometry));
              c.strokeStyle = "#ffffffaa";
              c.lineWidth = lw * 1.4;
              c.stroke();
            }
          }
          for (const f of fc?.features ?? []) {
            const kindOf = String(f.properties?.kind ?? "");
            if (kindOf === "zone" || kindOf === "zone-clip") continue;
            const trace = (ring: GeoJSON.Position[]) => {
              c.beginPath();
              ring.forEach(([lng, lat], i) => {
                const [x, y] = toCanvas(lng, lat);
                if (i) c.lineTo(x, y);
                else c.moveTo(x, y);
              });
            };
            if (f.geometry.type === "Polygon") {
              trace(f.geometry.coordinates[0]);
              if (kindOf === "service") {
                c.setLineDash([lw * 4, lw * 3]);
                c.strokeStyle = "#ffffffdd";
                c.lineWidth = lw * 1.1;
                c.stroke();
                c.setLineDash([]);
                continue;
              }
              const col = AREA_COLORS[kindOf] ?? "#8f7cff";
              c.closePath();
              c.fillStyle = `${col}${kindOf === "applicant" ? "70" : "38"}`;
              c.fill();
              if (kindOf === "applicant") {
                c.shadowColor = col;
                c.shadowBlur = lw * 6;
              }
              c.strokeStyle = col;
              c.lineWidth = kindOf === "applicant" ? lw * 1.6 : lw * 0.8;
              c.stroke();
              c.shadowBlur = 0;
            } else if (f.geometry.type === "LineString") {
              trace(f.geometry.coordinates);
              c.setLineDash([lw * 1.5, lw * 2]);
              c.strokeStyle = "#f87171";
              c.lineWidth = lw;
              c.stroke();
              c.setLineDash([]);
            }
          }
          ovTex.needsUpdate = true;
          dirty = true;
        };

        // ---- camera ----
        const anchorFor = (lng: number, lat: number) => {
          const px = ((mercX(lng, meta.zoom) - meta.mercPx[0]) / (meta.mercPx[2] - meta.mercPx[0])) * W;
          const py = ((mercY(lat, meta.zoom) - meta.mercPx[1]) / (meta.mercPx[3] - meta.mercPx[1])) * H;
          return toWorld(px, py, elev(Math.round(px), Math.round(py)) + (kind === "india" ? 120 : 15));
        };
        const views = {
          // India from the south, framed so the country fills the stage; phones look closer at the south
          india: narrow ? { t: new THREE.Vector3(-1.5, 0, 2.6), p: new THREE.Vector3(-1.1, 6.4, 9.4) } : { t: new THREE.Vector3(0, 0, 0.7), p: new THREE.Vector3(0, 9.6, 10.6) },
          region: narrow ? { t: new THREE.Vector3(-0.2, 0, 0.3), p: new THREE.Vector3(0, 10.5, 12.5) } : { t: new THREE.Vector3(0, -0.45, 0.8), p: new THREE.Vector3(0, 4.1, 9.6) },
          // a territory: a low view over the front wall, the slab filling the screen
          area: narrow ? { t: new THREE.Vector3(0, -0.1, 0.4), p: new THREE.Vector3(0, 9.5, 11) } : { t: new THREE.Vector3(0, -0.2, 0.6), p: new THREE.Vector3(0, 6.4, 8.6) },
        };
        const target = views[kind].t;
        const endPos = views[kind].p;
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.copy(target);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.minDistance = kind === "india" ? 3.2 : 1.2;
        controls.maxDistance = 18;
        controls.minPolarAngle = 0.2;
        controls.maxPolarAngle = kind === "india" ? 1.2 : 1.32;
        controls.enablePan = true;
        controls.screenSpacePanning = false;
        camera.position.copy(reducedMotion ? endPos : endPos.clone().multiplyScalar(1.45).add(new THREE.Vector3(1.6, 2, 0)));
        camera.lookAt(target);

        let dirty = true; // redraw on the next frame

        // ---- pins and tags ----
        type Pin = { size?: [number, number]; last?: { flip: boolean; dy: number }; c: MapPoint; anchor: THREE.Vector3; el: HTMLButtonElement; line: SVGLineElement; foot: SVGCircleElement };
        const SVG = "http://www.w3.org/2000/svg";
        let pins: Pin[] = [];
        const setCallouts = (callouts: MapPoint[]) => {
          pins.forEach((p) => {
            p.el.remove();
            p.line.remove();
            p.foot.remove();
          });
          pins = callouts.map((c, i) => {
            const anchor = anchorFor(c.lngLat[0], c.lngLat[1]);
            const b = document.createElement("button");
            b.type = "button";
            // a neon map pin (with the request count when there is one) and a glass name label; the tip sits on the place
            b.className = `dio-tag${c.muted ? " is-orphan" : ""}${c.passive ? " is-passive" : ""}${latest.current.activeKey === c.key ? " is-active" : ""}`;
            b.dataset.key = c.key;
            b.style.position = "absolute";
            b.style.left = "0";
            b.style.top = "0";
            b.style.setProperty("--d", `${reducedMotion ? 0 : 1 + i * 0.08}s`);
            if (c.color) b.style.setProperty("--pin", c.color);
            b.setAttribute("aria-label", `${c.title}${c.place ? `, ${c.place}` : ""}${c.count !== undefined ? `: ${c.count} new request${c.count === 1 ? "" : "s"}` : ""}${c.passive ? "" : ". Open"}`);
            b.innerHTML = `<span class="dp-pin"><span class="dp-head"><span class="dp-num">${c.count !== undefined ? c.count : ""}</span></span><span class="dp-pulse"></span></span><span class="dp-name"><b>${escapeHtml(c.title)}</b>${c.place ? ` ${escapeHtml(c.place)}` : ""}</span>`;
            if (c.passive) b.tabIndex = -1;
            else b.addEventListener("click", () => latest.current.onPick(c.key));
            layer.appendChild(b);
            const line = document.createElementNS(SVG, "line");
            line.setAttribute("stroke", c.muted ? "#8e8ea6" : "#b4a6ff");
            line.setAttribute("stroke-width", "1.5");
            line.setAttribute("stroke-dasharray", "2 3");
            line.setAttribute("opacity", "0.85");
            const foot = document.createElementNS(SVG, "circle");
            foot.setAttribute("r", "2.5");
            foot.setAttribute("fill", c.muted ? "#8e8ea6" : "#c9bfff");
            lines.appendChild(line);
            lines.appendChild(foot);
            return { c, anchor, el: b, line, foot };
          });
          dirty = true;
        };
        const setActive = (k: string | null | undefined) => {
          pins.forEach((p) => p.el.classList.toggle("is-active", p.c.key === k));
          dirty = true;
        };

        // camera flight to a place: keep the viewing direction, come closer
        let flight: { t: number; fromT: THREE.Vector3; toT: THREE.Vector3; fromP: THREE.Vector3; toP: THREE.Vector3 } | null = null;
        const flyTo = (p: [number, number] | null | undefined) => {
          const toT = p ? anchorFor(p[0], p[1]) : target.clone();
          const dir = camera.position.clone().sub(controls.target).normalize();
          const dist = p ? (kind === "india" ? 5 : 3.4) : endPos.distanceTo(target);
          const toP = p ? toT.clone().add(dir.multiplyScalar(dist)) : endPos.clone();
          if (reducedMotion) {
            controls.target.copy(toT);
            camera.position.copy(toP);
            dirty = true;
            return;
          }
          flight = { t: 0, fromT: controls.target.clone(), toT, fromP: camera.position.clone(), toP };
        };
        api.current = { setCallouts, setActive, setOverlay, flyTo };
        setCallouts(latest.current.points);
        setOverlay(latest.current.overlay);

        // place tags over their pins
        const v = new THREE.Vector3();
        // search: look for free spots (collision layout); otherwise keep each tag where it was and only follow the map
        const layout = (search = true) => {
          const w = el.clientWidth;
          const h = el.clientHeight;
          const items = pins
            .map((p) => {
              v.copy(p.anchor).add(new THREE.Vector3(0, 0.01, 0)).project(camera);
              return { p, x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, behind: v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1 };
            })
            .sort((a, b) => b.y - a.y);
          // pins never move off their places: every pin sits exactly on its spot, and only the name label
          // picks a side (and, in a tight cluster, a row just above or below) where it overlaps least
          const P = 24;
          const PH = 32;
          const placed: { x: number; y: number; w: number; h: number }[] = items.filter((it) => !it.behind).map((it) => ({ x: it.x - P / 2, y: it.y - PH, w: P, h: PH }));
          for (const it of items) {
            const tag = it.p.el;
            const hidden = it.behind;
            tag.style.display = hidden ? "none" : "";
            it.p.line.style.display = "none";
            it.p.foot.style.display = "none";
            if (hidden) continue;
            tag.style.zIndex = String(Math.round(it.y) + (it.p.c.key === latest.current.activeKey ? 5000 : 0)); // nearer pins in front
            const name = tag.querySelector<HTMLElement>(".dp-name")!;
            if (!it.p.size || !it.p.size[0]) it.p.size = [name.offsetWidth, name.offsetHeight];
            const [lw, lh] = it.p.size;
            const row = lh + 3;
            const labelRect = (t: { flip: boolean; dy: number }) => ({ x: t.flip ? it.x - P / 2 - 4 - lw : it.x + P / 2 + 4, y: it.y - 14 - lh + t.dy, w: lw, h: lh });
            const tries: { flip: boolean; dy: number }[] = [];
            if (it.p.last) tries.push(it.p.last);
            for (const dy of [0, -row, row, -2 * row, 2 * row, -3 * row]) for (const flip of [false, true]) tries.push({ flip, dy });
            let best = tries[0];
            let bestScore = Infinity;
            let bestRect = labelRect(best);
            for (const t of search || !it.p.last ? tries : tries.slice(0, 1)) {
              const r = labelRect(t);
              let score = (r.x < 4 ? 4 - r.x : 0) * 50 + (r.x + r.w > w - 4 ? r.x + r.w - w + 4 : 0) * 50 + (r.y < 4 ? 4 - r.y : 0) * 50 + Math.abs(t.dy) * 0.4;
              for (const q of placed) {
                const ox = Math.min(r.x + r.w, q.x + q.w) - Math.max(r.x, q.x);
                const oy = Math.min(r.y + r.h, q.y + q.h) - Math.max(r.y, q.y);
                if (ox > 0 && oy > 0) score += ox * oy;
              }
              if (score < bestScore) {
                bestScore = score;
                best = t;
                bestRect = r;
              }
              if (score === Math.abs(t.dy) * 0.4) break;
            }
            placed.push(bestRect);
            it.p.last = best;
            tag.classList.toggle("flip", best.flip);
            name.style.transform = best.dy ? `translateY(${best.dy}px)` : "";
            const tx = Math.round(best.flip ? it.x - P / 2 - 4 - lw : it.x - P / 2);
            tag.style.transform = `translate(${tx}px, ${Math.round(it.y - PH)}px)`;
            // a short neon connector when the label had to shift off its pin
            if (best.dy) {
              const lx = best.flip ? bestRect.x + bestRect.w : bestRect.x;
              it.p.line.style.display = "";
              it.p.line.setAttribute("x1", String(it.x));
              it.p.line.setAttribute("y1", String(it.y - PH + 12));
              it.p.line.setAttribute("x2", String(lx));
              it.p.line.setAttribute("y2", String(bestRect.y + bestRect.h / 2));
            }
          }
        };

        // ---- render on demand ----
        let introT = reducedMotion ? 1 : 0;
        const start = camera.position.clone();
        controls.addEventListener("change", () => (dirty = true));
        const onResize = () => {
          if (!renderer) return;
          camera.aspect = el.clientWidth / Math.max(1, el.clientHeight);
          camera.updateProjectionMatrix();
          renderer.setSize(el.clientWidth, el.clientHeight);
          dirty = true;
        };
        const ro = new ResizeObserver(onResize);
        ro.observe(el);
        cleanups.push(() => ro.disconnect());
        let lastLayout = 0;
        const sph = new THREE.Spherical();
        const off = new THREE.Vector3();
        let baseTheta: number | null = null;
        let swingT = 0;
        let idleSince = 0;
        let touching = false;
        controls.addEventListener("start", () => {
          touching = true;
          flight = null;
        });
        controls.addEventListener("end", () => {
          touching = false;
          idleSince = performance.now();
          baseTheta = null;
          layout();
          dirty = true;
        });
        const swingAmp = kind === "india" ? 0.26 : 0.16;
        const loop = (t: number) => {
          raf = requestAnimationFrame(loop);
          if (introT < 1) {
            introT = Math.min(1, introT + 1 / 120); // about 2 s settle
            const k = 1 - Math.pow(1 - introT, 3);
            camera.position.lerpVectors(start, endPos, k);
            camera.lookAt(controls.target);
            dirty = true;
            if (introT >= 1 && latest.current.focus) flyTo(latest.current.focus);
          }
          if (flight) {
            flight.t = Math.min(1, flight.t + 1 / 70);
            const k = flight.t < 0.5 ? 4 * flight.t ** 3 : 1 - (-2 * flight.t + 2) ** 3 / 2;
            controls.target.lerpVectors(flight.fromT, flight.toT, k);
            camera.position.lerpVectors(flight.fromP, flight.toP, k);
            dirty = true;
            if (flight.t >= 1) {
              flight = null;
              baseTheta = null;
              idleSince = t;
            }
          }
          if (latest.current.autoRotate && !reducedMotion && introT >= 1 && !flight && !touching && t - idleSince > 4000) {
            off.copy(camera.position).sub(controls.target);
            sph.setFromVector3(off);
            if (baseTheta === null) baseTheta = sph.theta - swingAmp * Math.sin(swingT);
            swingT += (2 * Math.PI) / (40 * 60);
            sph.theta = baseTheta + swingAmp * Math.sin(swingT);
            camera.position.copy(controls.target).add(off.setFromSpherical(sph));
            camera.lookAt(controls.target);
            dirty = true;
          }
          const moved = controls.update();
          if (!dirty && !moved) return;
          dirty = false;
          renderer!.render(scene, camera);
          // tags follow their pins every frame; while the view swings, spots are re-chosen only now and then so labels do not hop
          const swinging = baseTheta !== null;
          const search = introT < 1 || !!flight || t - lastLayout > (swinging ? 1500 : 120);
          layout(search);
          if (search) lastLayout = t;
        };
        raf = requestAnimationFrame(loop);
        latest.current.onReady?.();
        cleanups.push(() => {
          controls.dispose();
          top.dispose();
          walls.dispose();
          base.dispose();
          sat.dispose();
          ovTex.dispose();
          pins.forEach((p) => {
            p.el.remove();
            p.line.remove();
            p.foot.remove();
          });
        });
      } catch (e) {
        if (!disposed) latest.current.onFail((e as Error).message.slice(0, 80));
      }
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      cleanups.forEach((f) => f());
      if (renderer) {
        renderer.dispose();
        renderer.domElement.remove();
      }
      api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);

  // follow-ups change request counts: refresh the tags without rebuilding the model
  useEffect(() => {
    api.current?.setCallouts(points);
  }, [points]);

  useEffect(() => {
    api.current?.setActive(activeKey);
  }, [activeKey]);

  useEffect(() => {
    api.current?.setOverlay(overlay);
  }, [overlay]);

  useEffect(() => {
    api.current?.flyTo(focus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.[0], focus?.[1]]);

  return (
    <div className="relative isolate h-full w-full overflow-hidden" style={{ background: `url("${BACKDROP}") center bottom / cover no-repeat, #07070b` }}>
      <div ref={host} className="absolute inset-0" />
      <svg ref={lineLayer} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
      <div ref={tagLayer} className="pointer-events-none absolute inset-0" style={{ left: 0, top: 0 }} />
      {hint !== "" && <p className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/40 px-2.5 py-1 text-[12px] text-white/80">{hint ?? "Drag to rotate · scroll to zoom · click a territory to see its requests"}</p>}
    </div>
  );
}
