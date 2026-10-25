"use client";

// India as a 3D terrain diorama: relief cut to India's outline with sandstone walls, satellite colour on top,
// floating on a dark stage. Territories are pins with tags on poles showing requests. Click a tag to deep dive.
// Assets are baked once (scripts/bake_diorama.py). Any failure calls onFail and the parent shows the live map.
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { MapPoint } from "@/lib/map/terrain";
import { escapeHtml } from "@/lib/map/data";

export interface DioramaProps {
  points: MapPoint[];
  activeKey?: string | null;
  onPick: (key: string) => void;
  reducedMotion: boolean;
  onFail: (reason: string) => void;
  hint?: string;
  /** Slowly swing the view around India while nobody is touching it. */
  autoRotate?: boolean;
  /** Close-up of the territory region (default) or the whole of India. */
  view?: "region" | "india";
}

interface Meta {
  mercPx: [number, number, number, number];
  zoom: number;
  height: { w: number; h: number };
  sources: string;
}

const WIDTH = 10; // world units across the model
// India: the whole country cut to its outline. Region: a close-up rectangular slab of the territory region
// (Karnataka with a margin), thick rock walls in front, framed to fill the screen.
const STRATA = ["#9b7b57", "#c4a47c", "#7a5c3e", "#b39168", "#8c6d4c", "#d1b48c"].map((c) => new THREE.Color(c));
const MODES = {
  india: { dir: "/diorama/", ex: 16, base: -0.22, step: 2, strata: 260 },
  region: { dir: "/diorama/region/", ex: 7, base: -1.1, step: 1, strata: 9 },
};

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

export default function Diorama({ points, activeKey, onPick, reducedMotion, onFail, hint, autoRotate, view = "region" }: DioramaProps) {
  const host = useRef<HTMLDivElement>(null);
  const tagLayer = useRef<HTMLDivElement>(null);
  const lineLayer = useRef<SVGSVGElement>(null);
  const latest = useRef({ points, onPick, onFail, activeKey, autoRotate });
  latest.current = { points, onPick, onFail, activeKey, autoRotate };
  const api = useRef<{ setCallouts: (c: MapPoint[]) => void; setActive: (k: string | null | undefined) => void } | null>(null);

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
        const M = MODES[view];
        const narrow = el.clientWidth < 640;
        const EXAGGERATION = M.ex;
        const BASE_Y = M.base;
        const STEP = view === "region" && narrow ? 2 : M.step; // lighter mesh on phones
        const meta: Meta = await fetch(`${M.dir}meta.json`).then((r) => r.json());
        const [hImg, mImg, sat] = await Promise.all([loadImage(`${M.dir}height.png`), loadImage(`${M.dir}mask.png`), new THREE.TextureLoader().loadAsync(`${M.dir}sat.jpg`)]);
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
          // wavy rock strata: bands of sandstone tones that undulate along the wall
          const k = y * M.strata + Math.sin(x * 1.9) * 0.9 + Math.sin(x * 5.3 + z * 3.1) * 0.25;
          const layer = STRATA[((Math.floor(k) % STRATA.length) + STRATA.length) % STRATA.length];
          const col = deep.clone().lerp(sand, t * 0.75 + 0.25).lerp(layer, 0.55).offsetHSL(0, 0, Math.sin(k * 6.28) * 0.025);
          wcol.push(col.r, col.g, col.b);
        };
        const SEG = view === "region" ? 44 : 1; // vertical slices so the strata can show
        const wall = (k1: number, k2: number) => {
          const [x1, y1, z1] = [pos[k1 * 3], pos[k1 * 3 + 1], pos[k1 * 3 + 2]];
          const [x2, y2, z2] = [pos[k2 * 3], pos[k2 * 3 + 1], pos[k2 * 3 + 2]];
          for (let i = 0; i < SEG; i++) {
            const a1 = y1 + ((BASE_Y - y1) * i) / SEG, b1 = y1 + ((BASE_Y - y1) * (i + 1)) / SEG;
            const a2 = y2 + ((BASE_Y - y2) * i) / SEG, b2 = y2 + ((BASE_Y - y2) * (i + 1)) / SEG;
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
        const region = view === "region";
        const target = region ? (narrow ? new THREE.Vector3(-0.2, 0, 0.3) : new THREE.Vector3(0, -0.45, 0.8)) : narrow ? new THREE.Vector3(-1.7, 0, 2.3) : new THREE.Vector3(0.1, 0, 0.55);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.copy(target);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.minDistance = region ? 2 : 3.2;
        controls.maxDistance = 17;
        controls.minPolarAngle = 0.25;
        controls.maxPolarAngle = region ? 1.32 : 1.15;
        controls.enablePan = true;
        controls.screenSpacePanning = false;
        // region: a low view from the south over the front wall, wide enough that the slab spans the screen
        const endPos = region ? (narrow ? new THREE.Vector3(0, 10.5, 12.5) : new THREE.Vector3(0, 4.1, 9.6)) : narrow ? new THREE.Vector3(-1.3, 5.6, 8.6) : new THREE.Vector3(0.3, 9.4, 12.4);
        camera.position.copy(reducedMotion ? endPos : new THREE.Vector3(2.2, 15.5, 17.5));
        camera.lookAt(target);

        let dirty = true; // redraw on the next frame

        // ---- pins and tags ----
        type Pin = { size?: [number, number]; last?: { flip: boolean; dy: number }; c: MapPoint; anchor: THREE.Vector3; el: HTMLButtonElement; line: SVGLineElement; foot: SVGCircleElement };
        const SVG = "http://www.w3.org/2000/svg";
        let pins: Pin[] = [];
        const anchorFor = (lng: number, lat: number) => {
          const px = ((mercX(lng, meta.zoom) - meta.mercPx[0]) / (meta.mercPx[2] - meta.mercPx[0])) * W;
          const py = ((mercY(lat, meta.zoom) - meta.mercPx[1]) / (meta.mercPx[3] - meta.mercPx[1])) * H;
          return toWorld(px, py, elev(Math.round(px), Math.round(py)) + 120);
        };
        const pinGroup = new THREE.Group();
        scene.add(pinGroup);
        const setCallouts = (callouts: MapPoint[]) => {
          pins.forEach((p) => {
            p.el.remove();
            p.line.remove();
            p.foot.remove();
          });
          pinGroup.clear();
          pins = callouts.map((c, i) => {
            const anchor = anchorFor(c.lngLat[0], c.lngLat[1]);
            const b = document.createElement("button");
            b.type = "button";
            // a neon map pin (with the request count when there is one) and a glass name label; the tip sits on the place
            b.className = `dio-tag${c.muted ? " is-orphan" : ""}${latest.current.activeKey === c.key ? " is-active" : ""}`;
            b.dataset.key = c.key;
            b.style.position = "absolute";
            b.style.left = "0";
            b.style.top = "0";
            b.style.setProperty("--d", `${reducedMotion ? 0 : 1.2 + i * 0.12}s`);
            b.setAttribute("aria-label", `${c.title}, ${c.place}${c.count !== undefined ? `: ${c.count} new request${c.count === 1 ? "" : "s"}` : ""}. Open`);
            b.innerHTML = `<span class="dp-pin"><span class="dp-head"><span class="dp-num">${c.count !== undefined ? c.count : ""}</span></span><span class="dp-pulse"></span></span><span class="dp-name"><b>${escapeHtml(c.title)}</b> ${escapeHtml(c.place)}</span>`;
            b.addEventListener("click", () => latest.current.onPick(c.key));
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
        const setActive = (k: string | null | undefined) => pins.forEach((p) => p.el.classList.toggle("is-active", p.c.key === k));
        api.current = { setCallouts, setActive };
        setCallouts(latest.current.points);

        // place tags over their pins; tags that would collide rise on taller poles or slide sideways
        const v = new THREE.Vector3();
        // search: look for free spots (collision layout); otherwise keep each tag where it was and only follow the map
        const layout = (search = true) => {
          const w = el.clientWidth;
          const h = el.clientHeight;
          const items = pins
            .map((p) => {
              v.copy(p.anchor).add(new THREE.Vector3(0, 0.01, 0)).project(camera);
              return { p, x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, behind: v.z > 1 };
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
            tag.style.zIndex = String(Math.round(it.y)); // nearer pins in front
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
              const hx = it.x;
              const hy = it.y - PH + 12;
              const lx = best.flip ? bestRect.x + bestRect.w : bestRect.x;
              const ly = bestRect.y + bestRect.h / 2;
              it.p.line.style.display = "";
              it.p.line.setAttribute("x1", String(hx));
              it.p.line.setAttribute("y1", String(hy));
              it.p.line.setAttribute("x2", String(lx));
              it.p.line.setAttribute("y2", String(ly));
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
        });
        controls.addEventListener("end", () => {
          touching = false;
          idleSince = performance.now();
          baseTheta = null;
        });
        const loop = (t: number) => {
          raf = requestAnimationFrame(loop);
          if (introT < 1) {
            introT = Math.min(1, introT + 1 / 150); // about 2.5 s settle
            const k = 1 - Math.pow(1 - introT, 3);
            camera.position.lerpVectors(start, endPos, k);
            camera.lookAt(controls.target);
            dirty = true;
          }
          if (latest.current.autoRotate && !reducedMotion && introT >= 1 && !touching && t - idleSince > 4000) {
            off.copy(camera.position).sub(controls.target);
            sph.setFromVector3(off);
            if (baseTheta === null) baseTheta = sph.theta - (region ? 0.16 : 0.3) * Math.sin(swingT);
            swingT += (2 * Math.PI) / (40 * 60);
            sph.theta = baseTheta + (region ? 0.16 : 0.3) * Math.sin(swingT);
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
          const search = introT < 1 || t - lastLayout > (swinging ? 1500 : 120);
          layout(search);
          if (search) lastLayout = t;
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
    api.current?.setCallouts(points);
  }, [points]);

  useEffect(() => {
    api.current?.setActive(activeKey);
  }, [activeKey]);

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: "radial-gradient(70% 60% at 50% 42%, #1c2533 0%, #0a0f16 62%, #05080c 100%)" }}>
      <div ref={host} className="absolute inset-0" />
      <svg ref={lineLayer} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
      <div ref={tagLayer} className="pointer-events-none absolute inset-0" style={{ left: 0, top: 0 }} />
      <p className="pointer-events-none absolute bottom-2 right-3 text-[10.5px] text-white/45">Elevation: AWS Terrain Tiles · Imagery: Sentinel-2 cloudless by EOX · Relief exaggerated</p>
      <p className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/40 px-2.5 py-1 text-[12px] text-white/80">{hint ?? "Drag to rotate · scroll to zoom · click a territory to see its requests"}</p>
    </div>
  );
}
