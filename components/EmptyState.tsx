"use client";

import { useRef, useState } from "react";
import { Icon, StatusGlyph } from "./icons";

export function EmptyState({ onFile, onSample, error, loading }: { onFile: (f: File) => void; onSample: () => void; error: string | null; loading: boolean }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <main className="relative isolate mx-auto grid w-full max-w-[1240px] flex-1 grid-cols-1 items-center gap-10 px-4 py-10 md:grid-cols-[1.1fr_0.9fr] md:py-16">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10" style={{ background: "radial-gradient(55% 45% at 72% 42%, #f5c45122, transparent 70%), radial-gradient(45% 40% at 18% 85%, #4fd1e81a, transparent 70%), repeating-linear-gradient(0deg, #ffffff05 0 1px, transparent 1px 44px), repeating-linear-gradient(90deg, #ffffff05 0 1px, transparent 1px 44px)" }} />
      <div>
        <p className="hud-label text-gold">Expansion command · franchise partner review</p>
        <h1 className="hud mt-3 text-[40px] font-bold uppercase leading-[0.98] tracking-[0.01em] md:text-[62px]">
          Every application decided.
          <br />
          <span className="text-gold glow">Every decision explained.</span>
        </h1>
        <p className="mt-5 max-w-[52ch] text-[16px] leading-relaxed text-ink-2">
          Upload the applications and territories workbook. The desk checks each row, secures one store per pin code, ranks applicants for the slots that can really be filled, and drafts the next steps, training and first stock for partners who move forward. Then ask it anything in plain language.
        </p>
        <ul className="mt-6 grid max-w-[52ch] gap-2.5 text-[14px] text-ink-2">
          <li className="flex gap-2.5"><StatusGlyph status="APPROVED" /> Rules decide; the AI only reads your questions. Same file, same answer.</li>
          <li className="flex gap-2.5"><StatusGlyph status="ON_HOLD" /> Contradictions are held with the exact detail needed, never silently fixed.</li>
          <li className="flex gap-2.5"><StatusGlyph status="CONDITIONAL" /> Your file stays in this browser. Nothing is stored on a server.</li>
        </ul>
      </div>

      <div>
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
          className={`hud-panel group relative flex min-h-[280px] cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed p-8 text-center transition-colors ${over ? "border-gold bg-surface-2" : "border-line-strong hover:border-gold"}`}
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
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={onSample} disabled={loading} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[14px] font-semibold disabled:opacity-60" style={{ background: "var(--gold)", color: "var(--on-gold)" }}>
            <Icon.Spark /> Launch with sample data
          </button>
          <span className="text-[12px] text-muted">SAMPLE DATA: 22 invented applicants, not real people.</span>
        </div>
        <p className="mt-6 text-[12px] leading-relaxed text-muted">
          Works without an account, without the AI model and even if the server is asleep: parsing, decisions and the rule-based desk all run in your browser.
        </p>
      </div>
    </main>
  );
}
