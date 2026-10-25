"use client";
// Map overlays: the requests in one territory, and one request's exact location with a satellite view.
import { centroid } from "@/lib/engine/geo";
import reference from "@/lib/engine/reference.json";
import type { Decision, RunResult } from "@/lib/engine/types";
import { StatusChip } from "../icons";

const SHELL = "absolute inset-x-2 bottom-2 z-[4] flex max-h-[78%] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0b121b]/95 shadow-2xl backdrop-blur lg:inset-x-auto lg:bottom-auto lg:right-3 lg:top-3 lg:max-h-[calc(100%-120px)] lg:w-[360px]";

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
          <button type="button" onClick={onExplore} className="w-full rounded-lg border border-white/15 px-3 py-2 text-[13px] font-medium text-ink hover:border-gold">
            Explore the territory on the map
          </button>
        </footer>
      )}
    </section>
  );
}

const fmt = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? pos : neg}`;

export function LocationPanel({ decision, onBack, onViewDecision }: { decision: Decision; onBack: () => void; onViewDecision: () => void }) {
  const pin = decision.allocatedPin ?? decision.pin;
  const c = centroid(pin);
  const city = pin ? cityOfPin(pin) : undefined;
  const q = c ? `${c.lat.toFixed(5)},${c.lon.toFixed(5)}` : "";
  return (
    <section className={`${SHELL} rise`} aria-label={`Location of ${decision.id}`}>
      <header className="flex items-start gap-2 border-b border-white/10 px-4 py-3">
        <button type="button" onClick={onBack} className="mt-0.5 shrink-0 rounded-full px-2 py-1 text-[12.5px] text-ink-2 hover:bg-surface-2" aria-label="Back to the requests">
          ← Requests
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[16px] font-semibold text-ink">{decision.name || decision.id}</h2>
          <p className="num text-[12px] text-muted">
            {decision.id} · {decision.territoryId ?? "no territory"}
          </p>
        </div>
        <StatusChip status={decision.status} />
      </header>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-4 py-3 text-[13px]">
          <dt className="text-muted">Pin code</dt>
          <dd className="num text-ink">{pin ?? "Missing in the file"}</dd>
          <dt className="text-muted">City</dt>
          <dd className="text-ink">{city ?? "Outside the expansion cities"}</dd>
          <dt className="text-muted">Coordinates</dt>
          <dd className="num text-ink" data-testid="coords">
            {c ? `${fmt(c.lat, "N", "S")}, ${fmt(c.lon, "E", "W")}` : "Not available"}
          </dd>
          {c && (
            <>
              <dt className="text-muted">Precision</dt>
              <dd className="text-ink-2">{c.exact ? "Centre of the pin-code area" : "City centre (this pin code has no mapped centre)"}</dd>
            </>
          )}
        </dl>
        {c ? (
          <div className="px-4 pb-3">
            <div className="overflow-hidden rounded-lg border border-white/10 bg-black">
              <iframe
                key={q}
                title={`Google Maps satellite view of pin ${pin}`}
                src={`https://maps.google.com/maps?ll=${q}&q=${q}&t=k&z=17&ie=UTF8&iwloc=&output=embed`}
                className="block h-[220px] w-full lg:h-[260px]"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <a href={`https://www.google.com/maps/search/?api=1&query=${q}`} target="_blank" rel="noreferrer" className="rounded-lg border border-white/15 px-3 py-1.5 text-[12.5px] font-medium text-ink hover:border-gold">
                Open in Google Maps ↗
              </a>
              <button type="button" onClick={onViewDecision} className="rounded-lg bg-gold px-3 py-1.5 text-[12.5px] font-semibold text-[var(--on-gold)]">
                View decision
              </button>
            </div>
            <p className="mt-2 text-[11.5px] text-muted">The location is the pin code&apos;s centre, not the applicant&apos;s exact property.</p>
          </div>
        ) : (
          <div className="px-4 pb-4">
            <button type="button" onClick={onViewDecision} className="rounded-lg bg-gold px-3 py-1.5 text-[12.5px] font-semibold text-[var(--on-gold)]">
              View decision
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
