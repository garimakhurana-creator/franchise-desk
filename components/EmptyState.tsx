"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Icon, StatusGlyph } from "./icons";
import { cityPoints } from "@/lib/map/terrain";

const Diorama = dynamic(() => import("./map/Diorama"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-[13px] text-muted">Building the 3D view of India…</div>,
});

export function EmptyState({ onFile, onSample, error, loading }: { onFile: (f: File) => void; onSample: () => void; error: string | null; loading: boolean }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const points = useMemo(() => cityPoints(), []);
  const [picked, setPicked] = useState<string | null>(null);
  const [reduced, setReduced] = useState(false);
  const [map3d, setMap3d] = useState(true);
  useEffect(() => setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  const pickedCity = points.find((p) => p.key === picked);
  return (
    // The first screen is India in 3D with the expansion cities; the launch card floats over it
    <main className="relative isolate flex w-full flex-1 flex-col lg:block lg:h-[calc(100dvh-53px)] lg:overflow-hidden">
      <div className="relative h-[52vh] min-h-[340px] w-full lg:absolute lg:inset-y-0 lg:left-[440px] lg:right-0 lg:h-auto" aria-label="3D map of India with the expansion cities" style={{ background: "radial-gradient(90% 70% at 55% 35%, #1a2232 0%, #060a10 70%)" }}>
        {map3d && <Diorama points={points} activeKey={picked} onPick={setPicked} reducedMotion={reduced} onFail={() => setMap3d(false)} hint="Drag to rotate · scroll to zoom · click a city" />}
        {!map3d && <p className="grid h-full place-items-center text-[13px] text-muted">The 3D view needs WebGL. Everything else works.</p>}
        {pickedCity && (
          <div className="rise absolute inset-x-3 bottom-3 z-[4] rounded-xl border border-white/10 bg-[#0b121b]/95 p-4 shadow-2xl lg:inset-x-auto lg:bottom-auto lg:right-3 lg:top-3 lg:w-[320px]" role="dialog" aria-label={pickedCity.title}>
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <p className="text-[12px] text-muted">Expansion city · {pickedCity.place}</p>
                <h2 className="text-[17px] font-semibold">{pickedCity.title}</h2>
              </div>
              <button type="button" onClick={() => setPicked(null)} aria-label="Close" className="grid h-7 w-7 place-items-center rounded-full text-[18px] text-muted hover:bg-surface-2">×</button>
            </div>
            <p className="mt-1.5 text-[13px] text-ink-2">Load applications to see the territories and new requests here.</p>
            <button type="button" onClick={onSample} disabled={loading} className="mt-3 rounded-lg px-3 py-1.5 text-[13px] font-semibold disabled:opacity-60" style={{ background: "var(--gold)", color: "var(--on-gold)" }}>
              {loading ? "Loading…" : "Open with sample data"}
            </button>
          </div>
        )}
      </div>
      <div className="relative z-[3] w-full px-4 py-6 lg:absolute lg:left-4 lg:top-4 lg:max-h-[calc(100%-32px)] lg:w-[430px] lg:overflow-y-auto lg:rounded-2xl lg:border lg:border-white/10 lg:bg-[#0b121b]/92 lg:p-6 lg:shadow-2xl lg:backdrop-blur scrollbar-thin">
        <p className="text-[13px] font-medium text-gold">Franchise partner review for the expansion team</p>
        <h1 className="mt-2 text-[28px] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-[34px]">
          Every application decided.
          <br />
          <span className="text-gold">Every decision explained.</span>
        </h1>
        {/* The primary action sits right under the headline so it is on the first screen at every size */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" onClick={onSample} disabled={loading} className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[15px] font-bold disabled:opacity-60" style={{ background: "var(--gold)", color: "var(--on-gold)" }}>
            <Icon.Spark /> {loading ? "Loading…" : "Launch with sample data"}
          </button>
          <label htmlFor="file" className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-line-strong px-4 py-2.5 text-[14px] font-semibold text-ink hover:border-gold">
            <Icon.Upload /> Upload your file
          </label>
        </div>
        <p className="mt-2 text-[12px] text-muted">SAMPLE DATA: 22 invented applicants, not real people.</p>
        <p className="mt-4 text-[14px] leading-relaxed text-ink-2">
          Upload the applications and territories workbook. The desk checks each row, secures one store per pin code, ranks applicants for the slots that can really be filled, and drafts the next steps, training and first stock for partners who move forward. Then ask it anything in plain language.
        </p>
        <ul className="mt-4 grid gap-2 text-[13px] text-ink-2">
          <li className="flex gap-2.5"><StatusGlyph status="APPROVED" /> Rules decide; the AI only reads your questions. Same file, same answer.</li>
          <li className="flex gap-2.5"><StatusGlyph status="ON_HOLD" /> Contradictions are held with the exact detail needed, never silently fixed.</li>
          <li className="flex gap-2.5"><StatusGlyph status="CONDITIONAL" /> Your file stays in this browser. Nothing is stored on a server.</li>
        </ul>
        <div className="mt-5">
        <label
          htmlFor="file"
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
          className={`group relative rounded-xl bg-surface flex min-h-[130px] cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed p-5 text-center transition-colors ${over ? "border-gold bg-surface-2" : "border-line-strong hover:border-gold"}`}
          style={{ boxShadow: "var(--shadow)" }}
        >
          <span className="grid size-12 place-items-center rounded-full bg-surface-2 text-gold transition-transform group-hover:-translate-y-0.5">
            <Icon.Upload size={22} />
          </span>
          <span className="text-[17px] font-semibold">{loading ? "Reading the workbook…" : "Drop the Excel file here"}</span>
          <span className="text-[13px] text-muted">or click to choose · .xlsx in the case template layout · up to 8 MB</span>
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
        </label>
        {error && (
          <p role="alert" className="mt-3 rounded-md border px-3 py-2 text-[14px]" style={{ borderColor: "color-mix(in srgb, var(--declined) 40%, transparent)", color: "var(--declined)" }}>
            {error}
          </p>
        )}
        <p className="mt-4 text-[12px] leading-relaxed text-muted">
          Works without an account, without the AI model and even if the server is asleep: parsing, decisions and the rule-based desk all run in your browser.
        </p>
        </div>
      </div>
    </main>
  );
}
