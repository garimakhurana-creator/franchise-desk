"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Icon } from "./icons";
import { cityPoints } from "@/lib/map/terrain";
import { parseWorkbook } from "@/lib/parse/parse";
import { readWorkbook } from "@/lib/parse/xlsx";
import reference from "@/lib/engine/reference.json";

const Diorama = dynamic(() => import("./map/Diorama"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-[13px] text-muted">Building the 3D view of India…</div>,
});

type FeedItem = { key: string; id: string; name: string; city: string; pin: string };

const cityOf = (pin: string | null) => (pin ? reference.cities.find((c) => c.prefix === pin.slice(0, 3))?.city ?? null : null);

export function EmptyState({ onFile, onSample, error, loading }: { onFile: (f: File) => void; onSample: (openRequest?: string) => void; error: string | null; loading: boolean }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const points = useMemo(() => cityPoints(), []);
  const [picked, setPicked] = useState<string | null>(null);
  const [reduced, setReduced] = useState(false);
  const [map3d, setMap3d] = useState(true);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  useEffect(() => setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  // a preview of incoming requests, read from the bundled sample file (invented applicants)
  useEffect(() => {
    let live = true;
    fetch("/sample/sample-golden.xlsx")
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then((buf) => {
        const ds = parseWorkbook(readWorkbook(new Uint8Array(buf)), "sample", "sample");
        const items = ds.applications.flatMap((a) => {
          const city = a.city ?? cityOf(a.pin);
          return a.pin && city ? [{ key: a.key, id: a.id, name: a.name, city, pin: a.pin }] : [];
        });
        if (live) setFeed(items);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const pickedCity = points.find((p) => p.key === picked)?.title ?? null;
  const shown = pickedCity ? feed.filter((f) => f.city === pickedCity) : feed;
  const drop = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) onFile(f);
    },
  };
  return (
    // The first screen is India in 3D with the expansion cities; a slim panel carries upload and the request feed
    <main className="relative isolate flex w-full flex-1 flex-col lg:block lg:h-[calc(100dvh-53px)] lg:overflow-hidden" {...drop}>
      <div className="relative h-[52vh] min-h-[340px] w-full lg:absolute lg:inset-y-0 lg:left-[380px] lg:right-0 lg:h-auto" aria-label="3D map of India with the expansion cities" style={{ background: "radial-gradient(90% 70% at 55% 35%, #191a2b 0%, #07070b 70%)" }}>
        {map3d && <Diorama points={points} activeKey={picked} onPick={(k) => setPicked((p) => (p === k ? null : k))} reducedMotion={reduced} onFail={() => setMap3d(false)} autoRotate hint="Drag to rotate · scroll to zoom · click a city" />}
        {!map3d && <p className="grid h-full place-items-center text-[13px] text-muted">The 3D view needs WebGL. Everything else works.</p>}
      </div>
      <aside className="scrollbar-thin relative z-[3] flex w-full flex-col gap-4 px-4 py-5 lg:absolute lg:inset-y-0 lg:left-0 lg:w-[380px] lg:overflow-y-auto lg:border-r lg:border-white/10 lg:bg-[#0a0a10]">
        <div>
          <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.02em]">
            Partner requests <span className="neon-text">across India</span>
          </h1>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="file" className={`neon-btn inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-3 text-[15px] font-bold ${over ? "ring-2 ring-white" : ""}`}>
            <Icon.Upload /> {loading ? "Reading the workbook…" : "Upload your data"}
          </label>
          <button type="button" onClick={() => onSample()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-[14px] font-semibold text-ink hover:border-neon disabled:opacity-60">
            <Icon.Spark /> Try sample data
          </button>
          <input
            ref={input}
            id="file"
            type="file"
            accept=".xlsx,.xlsm,.xls"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
          <p className="text-[11.5px] text-muted">.xlsx in the case template · or drop it anywhere on this page</p>
        </div>
        {error && (
          <p role="alert" className="rounded-md border px-3 py-2 text-[13px]" style={{ borderColor: "color-mix(in srgb, var(--declined) 40%, transparent)", color: "var(--declined)" }}>
            {error}
          </p>
        )}
        {feed.length > 0 && (
          <section aria-label="Incoming requests" className="min-h-0">
            <div className="mb-1.5 flex items-baseline justify-between">
              <h2 className="text-[13px] font-semibold text-ink">
                Incoming requests{pickedCity ? ` · ${pickedCity}` : ""}
              </h2>
              <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10.5px] font-semibold tracking-wide text-muted">SAMPLE</span>
            </div>
            <ul className="divide-y divide-white/5 rounded-xl border border-white/10 bg-white/[0.02]">
              {shown.slice(0, 8).map((f) => (
                <li key={f.key}>
                  <button type="button" onClick={() => onSample(f.key)} disabled={loading} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/5">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#8f7cff22] text-[11px] font-semibold text-[#c9bfff]">{f.name.slice(0, 1)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-ink">{f.name}</span>
                      <span className="num block text-[11.5px] text-muted">
                        {f.city} · pin {f.pin}
                      </span>
                    </span>
                    <span aria-hidden className="text-muted">›</span>
                  </button>
                </li>
              ))}
              {!shown.length && <li className="px-3 py-3 text-[12.5px] text-muted">No sample requests in {pickedCity}.</li>}
            </ul>
            {shown.length > 8 && <p className="mt-1.5 text-[11.5px] text-muted">+{shown.length - 8} more · open the sample to see all</p>}
          </section>
        )}
      </aside>
    </main>
  );
}
