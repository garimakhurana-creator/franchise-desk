"use client";
// Map overlays: the requests in one territory, and one request's exact location with a satellite view.
import { centroid } from "@/lib/engine/geo";
import reference from "@/lib/engine/reference.json";
import type { Decision, RunResult } from "@/lib/engine/types";
import { StatusChip, STATUS_LABEL } from "../icons";
import { pinCells, areaKm2, SERVICE_KM } from "@/lib/map/pinAreas";

const SHELL = "absolute inset-x-2 bottom-2 z-[4] flex max-h-[52%] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0d0d14]/95 shadow-2xl backdrop-blur lg:inset-x-auto lg:bottom-auto lg:right-3 lg:top-3 lg:max-h-[calc(100%-120px)] lg:w-[360px]";

function CloseButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[18px] leading-none text-muted hover:bg-surface-2 hover:text-ink">
      ×
    </button>
  );
}

/** Requests that came in for one territory (or one city with no territory). */
export function territoryRequests(result: RunResult, key: string): Decision[] {
  if (key.startsWith("city:")) {
    const city = key.slice(5);
    return result.decisions.filter((d) => !d.territoryKey && d.pin && cityOfPin(d.pin) === city);
  }
  return result.decisions.filter((d) => d.territoryKey === key);
}

function cityOfPin(pin: string): string | undefined {
  return reference.cities.find((c) => c.prefix === pin.slice(0, 3))?.city;
}

export function RequestsPanel({ result, territoryKey, onOpenRequest, onExplore, onClose }: { result: RunResult; territoryKey: string; onOpenRequest: (d: Decision) => void; onExplore: () => void; onClose: () => void }) {
  const t = result.territories.find((x) => x.key === territoryKey);
  const title = t ? t.id : territoryKey.slice(5);
  const place = t ? t.city ?? "" : "No open territory here";
  const list = territoryRequests(result, territoryKey);
  return (
    <section className={`${SHELL} rise`} aria-label={`Requests in ${title}`}>
      <header className="flex items-start gap-2 border-b border-white/10 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-muted">Territory</p>
          <h2 className="truncate text-[17px] font-semibold text-ink">
            {title} <span className="font-normal text-ink-2">{place}</span>
          </h2>
          <p className="mt-0.5 text-[12.5px] text-ink-2">
            {list.length} new request{list.length === 1 ? "" : "s"}
          </p>
        </div>
        <CloseButton onClick={onClose} label="Close requests" />
      </header>
      <ul className="scrollbar-thin min-h-0 flex-1 overflow-y-auto py-1" data-testid="territory-requests">
        {list.map((d) => (
          <li key={d.key}>
            <button type="button" onClick={() => onOpenRequest(d)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 focus-visible:bg-white/5" data-request={d.key}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-ink">{d.name || d.id}</span>
                <span className="num block text-[12px] text-muted">
                  {d.id} · pin {d.allocatedPin ?? d.pin ?? "missing"}
                </span>
              </span>
              <StatusChip status={d.status} />
              <span aria-hidden className="text-muted">›</span>
            </button>
          </li>
        ))}
        {!list.length && <li className="px-4 py-6 text-[13px] text-muted">No requests here yet.</li>}
      </ul>
      {t && (
        <footer className="border-t border-white/10 p-3">
          <button type="button" onClick={onExplore} className="w-full rounded-lg border border-white/15 px-3 py-2 text-[13px] font-medium text-ink hover:border-neon">
            Show the whole territory
          </button>
        </footer>
      )}
    </section>
  );
}

const fmt = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? pos : neg}`;

const LEGEND: { kind: string; label: string; color: string }[] = [
  { kind: "applicant", label: "This request's pin area", color: "#8f7cff" },
  { kind: "free", label: "Free pin, no store yet", color: "#3cf2c0" },
  { kind: "rival", label: "Competing applicant", color: "#f5a524" },
  { kind: "store", label: "Our existing store", color: "#f87171" },
  { kind: "taken", label: "Pin given to a partner", color: "#9aa3b2" },
];

export function MapLegend() {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px] text-ink-2">
      {LEGEND.map((l) => (
        <li key={l.kind} className="flex items-center gap-1.5">
          <i className="inline-block size-2.5 rounded-sm" style={{ background: `${l.color}55`, boxShadow: `inset 0 0 0 1.5px ${l.color}` }} />
          {l.label}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <i className="inline-block h-0 w-3 border-t-2 border-dashed border-[#e4defc]" />
        {SERVICE_KM} km service ring
      </li>
    </ul>
  );
}

export function LocationPanel({ result, decision, index, total, onPrev, onNext, onBack, onViewDecision }: { result: RunResult; decision: Decision; index: number; total: number; onPrev: () => void; onNext: () => void; onBack: () => void; onViewDecision: () => void }) {
  const pin = decision.allocatedPin ?? decision.pin;
  const c = centroid(pin);
  const city = pin ? cityOfPin(pin) : undefined;
  const q = c ? `${c.lat.toFixed(5)},${c.lon.toFixed(5)}` : "";
  const cell = pin ? pinCells([pin]).get(pin) : undefined;
  const km2 = cell ? areaKm2(cell) : null;
  const rivals = result.decisions.filter((d) => d.key !== decision.key && decision.territoryKey && d.territoryKey === decision.territoryKey);
  const t = decision.territoryKey ? result.territories.find((x) => x.key === decision.territoryKey) : null;
  const free = t ? t.freePins.length : null;
  return (
    <section className={`${SHELL} rise`} aria-label={`Location of ${decision.id}`}>
      <header className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
        <button type="button" onClick={onBack} className="shrink-0 rounded-full px-2 py-1 text-[12.5px] text-ink-2 hover:bg-surface-2" aria-label="Back to the requests">
          ← Requests
        </button>
        <div className="flex-1" />
        <span className="num text-[12px] text-muted">
          {index + 1} of {total}
        </span>
        <button type="button" onClick={onPrev} disabled={total < 2} aria-label="Previous request" className="grid h-7 w-7 place-items-center rounded-full border border-white/10 text-ink hover:border-neon disabled:opacity-40">
          ‹
        </button>
        <button type="button" onClick={onNext} disabled={total < 2} aria-label="Next request" className="grid h-7 w-7 place-items-center rounded-full border border-white/10 text-ink hover:border-neon disabled:opacity-40">
          ›
        </button>
      </header>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="flex items-start gap-2 px-4 pt-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[17px] font-semibold text-ink">{decision.name || decision.id}</h2>
            <p className="num text-[12px] text-muted">
              {decision.id} · {decision.territoryId ?? "no territory"}
            </p>
          </div>
          <StatusChip status={decision.status} />
        </div>
        {c ? (
          <div className="px-4 pt-3">
            <div className="relative overflow-hidden rounded-lg border border-white/10 bg-black">
              <iframe
                key={q}
                title={`Google Maps satellite view of pin ${pin}`}
                src={`https://maps.google.com/maps?ll=${q}&q=${q}&t=k&z=17&ie=UTF8&iwloc=&output=embed`}
                className="block h-[210px] w-full lg:h-[230px]"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
              <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10.5px] font-semibold tracking-wide text-white">GOOGLE SATELLITE</span>
            </div>
          </div>
        ) : null}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-4 py-3 text-[13px]">
          <dt className="text-muted">Pin code</dt>
          <dd className="num text-ink">{pin ?? "Missing in the file"}</dd>
          <dt className="text-muted">City</dt>
          <dd className="text-ink">{city ?? "Outside the expansion cities"}</dd>
          <dt className="text-muted">Coordinates</dt>
          <dd className="num text-ink" data-testid="coords">
            {c ? `${fmt(c.lat, "N", "S")}, ${fmt(c.lon, "E", "W")}` : "Not available"}
          </dd>
          {km2 !== null && (
            <>
              <dt className="text-muted">Pin area</dt>
              <dd className="num text-ink">
                ≈ {km2.toFixed(1)} km² <span className="text-muted">(approximate)</span>
              </dd>
            </>
          )}
          {decision.nearest && (
            <>
              <dt className="text-muted">Nearest store</dt>
              <dd className="num text-ink">
                {decision.nearest.storeId} · {decision.nearest.km !== null ? `${decision.nearest.km} km` : `${decision.nearest.pinGap} pins away`} · {decision.nearest.risk} overlap
              </dd>
            </>
          )}
          {free !== null && (
            <>
              <dt className="text-muted">Free pins</dt>
              <dd className="num text-ink">
                {free} of {t!.pins.length} in {t!.id} have no store
              </dd>
            </>
          )}
        </dl>
        <div className="border-t border-white/10 px-4 py-3">
          <MapLegend />
        </div>
        {rivals.length > 0 && (
          <div className="border-t border-white/10 px-4 py-3">
            <h3 className="mb-1.5 text-[12px] font-semibold text-muted">Competing for {t?.id ?? "this territory"}</h3>
            <ul className="grid gap-1 text-[12.5px]">
              {rivals.map((r) => (
                <li key={r.key} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-ink">
                    {r.id} {r.name}
                  </span>
                  <span className="num text-muted">{r.allocatedPin ?? r.pin ?? "–"}</span>
                  <span className="text-[11.5px] text-ink-2">{STATUS_LABEL[r.status]}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-2 border-t border-white/10 px-4 py-3">
          <button type="button" onClick={onViewDecision} className="neon-btn rounded-lg px-3 py-1.5 text-[12.5px] font-semibold">
            View decision
          </button>
          {c && (
            <a href={`https://www.google.com/maps/search/?api=1&query=${q}`} target="_blank" rel="noreferrer" className="rounded-lg border border-white/15 px-3 py-1.5 text-[12.5px] font-medium text-ink hover:border-neon">
              Open in Google Maps ↗
            </a>
          )}
        </div>
        <p className="px-4 pb-3 text-[11px] text-muted">Locations are pin-code centres; pin areas are estimated from neighbouring pin centres, not official boundaries.</p>
      </div>
    </section>
  );
}
