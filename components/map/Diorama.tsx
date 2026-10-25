"use client";

// India as a 3D terrain diorama: relief cut to India's outline with sandstone walls, satellite colour on top,
// floating on a dark stage. Territories are pins with tags on poles showing requests. Click a tag to deep dive.
// Assets are baked once (scripts/bake_diorama.py). Any failure calls onFail and the parent shows the live map.
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { RunResult, Status } from "@/lib/engine/types";
import { buildTerrainData, type Callout } from "@/lib/map/terrain";
import { escapeHtml } from "@/lib/map/data";

export interface DioramaProps {
  result: RunResult;
  onDeepDive: (territoryKey: string | null, lngLat: [number, number]) => void;
  reducedMotion: boolean;
  onFail: (reason: string) => void;
}

interface Meta {
  mercPx: [number, number, number, number];
  zoom: number;
  height: { w: number; h: number };
  sources: string;
}

const STATUS_HEX: Record<Status, string> = { APPROVED: "#2fbf8f", CONDITIONAL: "#4fc3d9", WAITLISTED: "#9aa6d3", ON_HOLD: "#e39a3b", DECLINED: "#e2685f", WITHDRAWN: "#8a989e" };
const STATUS_ORDER: Status[] = ["APPROVED", "CONDITIONAL", "WAITLISTED", "ON_HOLD", "DECLINED", "WITHDRAWN"];
const WIDTH = 10; // world units across the model
const EXAGGERATION = 16; // relief exaggeration so the land reads at country scale
const BASE_Y = -0.22; // depth of the cut walls
const STEP = 2; // heightmap pixels per mesh cell

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => rej(new Error(`could not load ${src}`));
    img.src = src;
  });
}

function pixels(img: HTMLImageElement, w: number, h: number): Uint8ClampedArray {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true })!;
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

export default function Diorama({ result, onDeepDive, reducedMotion, onFail }: DioramaProps) {
  const host = useRef<HTMLDivElement>(null);
  const tagLayer = useRef<HTMLDivElement>(null);
  const lineLayer = useRef<SVGSVGElement>(null);
  const latest = useRef({ result, onDeepDive, onFail });
  latest.current = { result, onDeepDive, onFail };
  const api = useRef<{ setCallouts: (c: Callout[]) => void } | null>(null);

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
        if (!(test.getContext("webgl2") || test.getContext("webgl"))) throw new Error("WebGL is not available");
        const meta: Meta = await fetch("/diorama/meta.json").then((r) => r.json());
        const [hImg, mImg, sat] = await Promise.all([loadImage("/diorama/height.png"), loadImage("/diorama/mask.png"), new THREE.TextureLoader().loadAsync("/diorama/sat.jpg")]);
        if (disposed) return;
        const W = meta.height.w;
        const H = meta.height.h;
        const hp = pixels(hImg, W, H);
        const mp = pixels(mImg, W, H);
        const elev = (x: number, y: number) => {
          const i = (Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))) * 4;
          const m = hp[i] * 256 + hp[i + 1] + hp[i + 2] / 256 - 32768;
          return Math.max(0, m);
        };
        const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && mp[(y * W + x) * 4] > 127;
        const depth = (WIDTH * H) / W;
        const scaleY = (WIDTH / ((meta.mercPx[2] - meta.mercPx[0]) * 40075016 / (2 ** meta.zoom * 256))) * EXAGGERATION; // world units per metre
        const toWorld = (px: number, py: number, m: number) => new THREE.Vector3((px / W - 0.5) * WIDTH, m * scaleY, (py / H - 0.5) * depth);

        // ---- top surface, cut to India ----
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
        sat.colorSpace = THREE.SRGBColorSpace;
        sat.anisotropy = 8;

        // ---- sandstone walls and base along every outside edge ----
        const wpos: number[] = [];
        const wcol: number[] = [];
        const sand = new THREE.Color("#caa676");
        const deep = new THREE.Color("#5a3f27");
        const pushV = (x: number, y: number, z: number) => {
          wpos.push(x, y, z);
          const t = Math.min(1, Math.max(0, (y - BASE_Y) / (0.06 - BASE_Y)));
          const band = Math.sin(y * 260) * 0.06; // faint strata
          const col = deep.clone().lerp(sand, t * 0.9 + 0.1).offsetHSL(0, 0, band);
          wcol.push(col.r, col.g, col.b);
        };
        const wall = (k1: number, k2: number) => {
          const [x1, y1, z1] = [pos[k1 * 3], pos[k1 * 3 + 1], pos[k1 * 3 + 2]];
          const [x2, y2, z2] = [pos[k2 * 3], pos[k2 * 3 + 1], pos[k2 * 3 + 2]];
          pushV(x1, y1, z1); pushV(x1, BASE_Y, z1); pushV(x2, y2, z2);
          pushV(x2, y2, z2); pushV(x1, BASE_Y, z1); pushV(x2, BASE_Y, z2);
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
        const camera = new THREE.PerspectiveCamera(32, el.clientWidth / el.clientHeight, 0.05, 100);
        scene.add(new THREE.HemisphereLight("#cfe0ff", "#3b2a1a", 0.9));
        const sun = new THREE.DirectionalLight("#fff1dc", 2.4);
        sun.position.set(-6, 9, -4); // from the north-west, so slopes facing south-east catch light
        scene.add(sun);
        scene.add(new THREE.Mesh(top, new THREE.MeshStandardMaterial({ map: sat, roughness: 0.92, metalness: 0 })));
        scene.add(new THREE.Mesh(walls, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide })));
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
        const shadow = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH * 1.25, depth * 1.2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sh), transparent: true, depthWrite: false }));
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = BASE_Y - 0.12;
        scene.add(shadow);

        // ---- camera: looking at India from the south, Karnataka in front ----
        // phones frame south India closely so the territory tags have room; wide screens show the whole country
        const narrow = el.clientWidth < 640;
        const target = narrow ? new THREE.Vector3(-1.7, 0, 2.3) : new THREE.Vector3(0.1, 0, 0.55);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.copy(target);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.minDistance = 3.2;
        controls.maxDistance = 17;
        controls.minPolarAngle = 0.25;
        controls.maxPolarAngle = 1.15;
        controls.enablePan = true;
        controls.screenSpacePanning = false;
        const endPos = narrow ? new THREE.Vector3(-1.3, 5.6, 8.6) : new THREE.Vector3(0.3, 9.4, 12.4);
        camera.position.copy(reducedMotion ? endPos : new THREE.Vector3(2.2, 15.5, 17.5));
        camera.lookAt(target);

        let dirty = true; // redraw on the next frame

        // ---- pins and tags ----
        type Pin = { c: Callout; anchor: THREE.Vector3; el: HTMLButtonElement; line: SVGLineElement; foot: SVGCircleElement };
        const SVG = "http://www.w3.org/2000/svg";
        let pins: Pin[] = [];
        const anchorFor = (lng: number, lat: number) => {
          const px = ((mercX(lng, meta.zoom) - meta.mercPx[0]) / (meta.mercPx[2] - meta.mercPx[0])) * W;
          const py = ((mercY(lat, meta.zoom) - meta.mercPx[1]) / (meta.mercPx[3] - meta.mercPx[1])) * H;
          return toWorld(px, py, elev(Math.round(px), Math.round(py)) + 120);
        };
        const pinGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8);
        const pinMat = new THREE.MeshBasicMaterial({ color: "#f5c451" });
        const pinGroup = new THREE.Group();
        scene.add(pinGroup);
        const setCallouts = (callouts: Callout[]) => {
          pins.forEach((p) => {
            p.el.remove();
            p.line.remove();
            p.foot.remove();
          });
          pinGroup.clear();
          pins = callouts.map((c, i) => {
            const anchor = anchorFor(c.lngLat[0], c.lngLat[1]);
            const stick = new THREE.Mesh(pinGeo, pinMat);
            stick.position.copy(anchor).add(new THREE.Vector3(0, 0.08, 0));
            pinGroup.add(stick);
            const b = document.createElement("button");
            b.type = "button";
            // the tag itself is the button; its leader line is drawn in the SVG layer underneath all tags
            b.className = `tm-tag dio-tag${c.noTerritory ? " is-orphan" : ""}`;
            b.style.position = "absolute";
            b.style.left = "0";
            b.style.top = "0";
            b.style.setProperty("--d", `${reducedMotion ? 0 : 1.2 + i * 0.12}s`);
            b.setAttribute("aria-label", `${c.title} ${c.place}: ${c.requests} requests. Open this area.`);
            const bar = STATUS_ORDER.filter((s) => c.counts[s]).map((s) => `<i style="flex:${c.counts[s]};background:${STATUS_HEX[s]}"></i>`).join("");
            const slots = c.noTerritory ? "no open territory" : `${c.used}/${c.capacity} slots${c.wanted > c.capacity ? ` · ${c.wanted} wanted` : ""}`;
            b.innerHTML = `<span class="tm-title"><b>${escapeHtml(c.title)}</b> ${escapeHtml(c.place)}</span><span class="tm-sub"><span class="tm-req">${c.requests}</span> request${c.requests === 1 ? "" : "s"} · ${escapeHtml(slots)}</span><span class="tm-bar">${bar}</span>`;
            b.addEventListener("click", () => latest.current.onDeepDive(c.noTerritory ? null : c.key, c.lngLat));
            layer.appendChild(b);
            const line = document.createElementNS(SVG, "line");
            line.setAttribute("stroke", c.noTerritory ? "#d9d6cf" : "#fbfaf6");
            line.setAttribute("stroke-width", "1.5");
            line.setAttribute("opacity", "0.9");
            const foot = document.createElementNS(SVG, "circle");
            foot.setAttribute("r", "3.5");
            foot.setAttribute("fill", c.noTerritory ? "#d9d6cf" : "#fbfaf6");
            lines.appendChild(line);
            lines.appendChild(foot);
            return { c, anchor, el: b, line, foot };
          });
          dirty = true;
        };
        api.current = { setCallouts };
        setCallouts(buildTerrainData(latest.current.result).callouts);

        // place tags over their pins; tags that would collide rise on taller poles or slide sideways
        const v = new THREE.Vector3();
        const layout = () => {
          const w = el.clientWidth;
          const h = el.clientHeight;
          const items = pins
            .map((p) => {
              v.copy(p.anchor).add(new THREE.Vector3(0, 0.16, 0)).project(camera);
              return { p, x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, behind: v.z > 1 };
            })
            .sort((a, b) => b.y - a.y);
          const placed: { x: number; y: number; w: number; h: number }[] = [];
          for (const it of items) {
            const tag = it.p.el;
            const hidden = it.behind;
            tag.style.display = hidden ? "none" : "";
            it.p.line.style.display = hidden ? "none" : "";
            it.p.foot.style.display = hidden ? "none" : "";
            const tw = tag.offsetWidth;
            const th = tag.offsetHeight;
            let best = { L: 36, dx: 0 };
            outer: for (const L of [36, 74, 112, 150, 188, 226, 264]) {
              for (const dx of [0, -0.6 * tw, 0.6 * tw, -1.1 * tw, 1.1 * tw, -1.6 * tw, 1.6 * tw]) {
                const r = { x: it.x - tw / 2 + dx - 4, y: it.y - L - th - 10, w: tw + 8, h: th + 6 };
                if (r.y < 6 || r.x < 4 || r.x + r.w > w - 4) continue;
                if (!placed.some((q) => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y)) {
                  best = { L, dx };
                  placed.push(r);
                  break outer;
                }
              }
            }
            const tx = Math.round(it.x + best.dx - tw / 2);
            const ty = Math.round(it.y - best.L - th);
            tag.style.transform = `translate(${tx}px, ${ty}px)`;
            it.p.line.setAttribute("x1", String(it.x));
            it.p.line.setAttribute("y1", String(it.y));
            it.p.line.setAttribute("x2", String(it.x + best.dx));
            it.p.line.setAttribute("y2", String(ty + th));
            it.p.foot.setAttribute("cx", String(it.x));
            it.p.foot.setAttribute("cy", String(it.y));
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
        const loop = (t: number) => {
          raf = requestAnimationFrame(loop);
          if (introT < 1) {
            introT = Math.min(1, introT + 1 / 150); // about 2.5 s settle
            const k = 1 - Math.pow(1 - introT, 3);
            camera.position.lerpVectors(start, endPos, k);
            camera.lookAt(controls.target);
            dirty = true;
          }
          const moved = controls.update();
          if (!dirty && !moved) return;
          dirty = false;
          renderer!.render(scene, camera);
          if (t - lastLayout > 60 || introT < 1) {
            layout();
            lastLayout = t;
          }
        };
        raf = requestAnimationFrame(loop);
        controls.addEventListener("end", () => {
          layout();
          dirty = true;
        });
        cleanups.push(() => {
          controls.dispose();
          top.dispose();
          walls.dispose();
          base.dispose();
          sat.dispose();
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
  }, []);

  // follow-ups change request counts: refresh the tags without rebuilding the model
  useEffect(() => {
    api.current?.setCallouts(buildTerrainData(result).callouts);
  }, [result]);

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: "radial-gradient(70% 60% at 50% 42%, #1c2533 0%, #0a0f16 62%, #05080c 100%)" }}>
      <div ref={host} className="absolute inset-0" />
      <svg ref={lineLayer} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
      <div ref={tagLayer} className="pointer-events-none absolute inset-0" style={{ left: 0, top: 0 }} />
      <p className="pointer-events-none absolute bottom-2 right-3 text-[10.5px] text-white/45">Elevation: AWS Terrain Tiles · Imagery: Sentinel-2 cloudless by EOX · Relief exaggerated</p>
      <p className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/40 px-2.5 py-1 text-[12px] text-white/80">Drag to rotate · scroll to zoom · click a territory to open it</p>
    </div>
  );
}
