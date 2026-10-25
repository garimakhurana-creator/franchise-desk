"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Icon } from "./icons";
import { cityPoints } from "@/lib/map/terrain";

const Diorama = dynamic(() => import("./map/Diorama"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-[13px] text-muted">Building the 3D view of India…</div>,
});

export function EmptyState({ onFile, onSample, error, loading }: { onFile: (f: File) => void; onSample: () => void; error: string | null; loading: boolean }) {
  const [over, setOver] = useState(false);
  const points = useMemo(() => cityPoints(), []);
  const [picked, setPicked] = useState<string | null>(null);
  const [reduced, setReduced] = useState(false);
  const [map3d, setMap3d] = useState(true);
  useEffect(() => setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  return (
    // The first screen is only the map: India in 3D with the expansion cities, and one upload control floating on it
    <main
      className="relative isolate h-[calc(100dvh-53px)] w-full overflow-hidden"
      aria-label="3D map of India with the expansion cities"
      style={{ background: "radial-gradient(90% 70% at 55% 35%, #191a2b 0%, #07070b 70%)" }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
    >
      {map3d && <Diorama points={points} activeKey={picked} onPick={(k) => setPicked((p) => (p === k ? null : k))} reducedMotion={reduced} onFail={() => setMap3d(false)} autoRotate hint="Drag to rotate · scroll to zoom" />}
      {!map3d && <p className="grid h-full place-items-center text-[13px] text-muted">The 3D view needs WebGL. Upload still works.</p>}
      {over && <div className="pointer-events-none absolute inset-3 z-[4] grid place-items-center rounded-2xl border-2 border-dashed border-[#b4a6ff] bg-[#8f7cff14] text-[16px] font-semibold text-white">Drop the Excel file to open it</div>}
      <div className="absolute inset-x-0 bottom-6 z-[5] flex flex-col items-center gap-2 px-4">
        {error && (
          <p role="alert" className="max-w-[520px] rounded-lg border bg-[#0d0d14e6] px-3 py-2 text-[13px]" style={{ borderColor: "color-mix(in srgb, var(--declined) 40%, transparent)", color: "var(--declined)" }}>
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/10 bg-[#0d0d14cc] p-1.5 shadow-2xl backdrop-blur">
          <label htmlFor="file" className="neon-btn inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-bold">
            <Icon.Upload /> {loading ? "Reading the workbook…" : "Upload your data"}
          </label>
          <button type="button" onClick={onSample} disabled={loading} className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13.5px] font-semibold text-ink-2 hover:bg-white/5 hover:text-ink disabled:opacity-60">
            <Icon.Spark /> Try sample data
          </button>
          <input
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
        </div>
      </div>
    </main>
  );
}
