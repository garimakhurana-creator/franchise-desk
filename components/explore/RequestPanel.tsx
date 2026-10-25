"use client";
// One request, start to finish: the verdict and its reason first, then the place (satellite view, coordinates,
// pin area), its catchment against our stores, who else wants this territory, and what happens next.
import { centroid } from "@/lib/engine/geo";
import reference from "@/lib/engine/reference.json";
import type { Decision, RunResult, Status } from "@/lib/engine/types";
import { pinCells, areaKm2, catchmentCoverage, SERVICE_KM } from "@/lib/map/pinAreas";
import { StatusChip, STATUS_LABEL } from "../icons";

export const STATUS_HEX: Record<Status, string> = { APPROVED: "#34d399", CONDITIONAL: "#c3f25c", WAITLISTED: "#9aa3b2", ON_HOLD: "#f5a524", DECLINED: "#f87171", WITHDRAWN: "#8b97a6" };

const VERDICT: Record<Status, string> = {
  APPROVED: "Approved: moving forward",
  CONDITIONAL: "Approved with conditions",
  WAITLISTED: "Waitlisted: no slot free yet",
  ON_HOLD: "On hold: we need information",
  DECLINED: "Declined",
  WITHDRAWN: "Withdrawn by the applicant",
};

const fmt = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? pos : neg}`;
const cityOf = (pin: string | null) => (pin ? reference.cities.find((c) => c.prefix === pin.slice(0, 3))?.city : undefined);

/** Every existing store we know a location for: the reference list plus stores named in the territories sheet. */
export function storeLocations(result: RunResult): { id: string; pin: string; lat: number; lon: number }[] {
  const seen = new Set<string>();
  const out: { id: string; pin: string; lat: number; lon: number }[] = [];
  for (const s of [...reference.stores, ...result.territories.flatMap((t) => t.storePins.map((p) => ({ id: p.storeId, pin: p.pin })))]) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    const c = centroid(s.pin);
    if (c) out.push({ id: s.id, pin: s.pin, lat: c.lat, lon: c.lon });
  }
  return out;
}

export function RequestPanel({ result, decision, index, total, onPrev, onNext, onClose, onFullDecision }: { result: RunResult; decision: Decision; index: number; total: number; onPrev: () => void; onNext: () => void; onClose: () => void; onFullDecision: () => void }) {
  const pin = decision.allocatedPin ?? decision.pin;
  const c = centroid(pin);
  const q = c ? `${c.lat.toFixed(5)},${c.lon.toFixed(5)}` : "";
  const cell = pin ? pinCells([pin]).get(pin) : undefined;
  const km2 = cell ? areaKm2(cell) : null;
  const cover = c ? catchmentCoverage(c, storeLocations(result)) : null;
  const t = decision.territoryKey ? result.territories.find((x) => x.key === decision.territoryKey) : null;
  const rivals = result.decisions.filter((d) => d.key !== decision.key && decision.territoryKey && d.territoryKey === decision.territoryKey);
  const tone = STATUS_HEX[decision.status];
  const reasons = decision.status === "APPROVED" ? [] : decision.detail.slice(0, 3);
  return (
    <section className="rise absolute inset-x-2 bottom-2 z-[6] flex max-h-[62%] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0c0c13]/95 shadow-2xl backdrop-blur lg:inset-x-auto lg:bottom-3 lg:right-3 lg:top-3 lg:max-h-none lg:w-[420px]" aria-label={`Request ${decision.id}`}>
      <header className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <button type="button" onClick={onClose} className="rounded-full px-2 py-1 text-[12.5px] text-ink-2 hover:bg-white/5" aria-label="Back to the requests">
          ← All requests
        </button>
        <div className="flex-1" />
        <span className="num text-[12px] text-muted">
          {index + 1} of {total}
        </span>
        <button type="button" onClick={onPrev} disabled={total < 2} aria-label="Previous request" className="grid size-7 place-items-center rounded-full border border-white/10 text-ink hover:border-neon disabled:opacity-40">
          ‹
        </button>
        <button type="button" onClick={onNext} disabled={total < 2} aria-label="Next request" className="grid size-7 place-items-center rounded-full border border-white/10 text-ink hover:border-neon disabled:opacity-40">
          ›
        </button>
      </header>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 pt-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[19px] font-semibold text-ink">{decision.name || decision.id}</h2>
              <p className="num text-[12px] text-muted">
                {decision.id} · {t ? `${t.id} ${t.city ?? ""}` : "no open territory"} · pin {pin ?? "missing"}
              </p>
            </div>
            <StatusChip status={decision.status} />
          </div>

          {/* the verdict and its reason, before anything else */}
          <div className="mt-3 rounded-xl border p-3" style={{ borderColor: `${tone}66`, background: `${tone}12` }} data-testid="verdict">
            <p className="text-[13px] font-semibold" style={{ color: tone }}>
              {VERDICT[decision.status]}
            </p>
            <p className="mt-1 text-[14px] leading-snug text-ink">{decision.why}</p>
            {reasons.length > 0 && (
              <ul className="mt-2 grid gap-1 text-[12.5px] text-ink-2">
                {reasons.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden style={{ color: tone }}>•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {c && (
          <div className="px-4 pt-3">
            <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black">
              <iframe key={q} title={`Google Maps satellite view of pin ${pin}`} src={`https://maps.google.com/maps?ll=${q}&q=${q}&t=k&z=16&ie=UTF8&iwloc=&output=embed`} className="block h-[200px] w-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
              <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10.5px] font-semibold tracking-wide text-white">GOOGLE SATELLITE</span>
            </div>
          </div>
        )}

        <dl className="grid grid-cols-2 gap-2 px-4 pt-3 text-[12.5px]">
          <Fact label="Coordinates" value={c ? `${fmt(c.lat, "N", "S")}\n${fmt(c.lon, "E", "W")}` : "Not available"} testid="coords" />
          <Fact label="City" value={cityOf(pin) ?? "Outside the expansion cities"} />
          <Fact label="Pin area" value={km2 !== null ? `≈ ${km2.toFixed(1)} km²` : "Not available"} note="estimated from pin centres" />
          <Fact label="Nearest store" value={decision.nearest ? `${decision.nearest.storeId} · ${decision.nearest.km !== null ? `${decision.nearest.km} km` : `${decision.nearest.pinGap} pins away`}` : "None nearby"} note={decision.nearest ? `${decision.nearest.risk} overlap` : undefined} />
        </dl>

        {cover && (
          <div className="mx-4 mt-3 rounded-xl border border-white/10 p-3">
            <div className="flex items-baseline justify-between">
              <p className="text-[12.5px] font-semibold text-ink">{SERVICE_KM} km catchment</p>
              <p className="num text-[12px] text-muted">{cover.km2.toFixed(1)} km²</p>
            </div>
            <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-[#3cf2c033]" aria-hidden>
              <i className="block h-full bg-[#f87171]" style={{ width: `${cover.servedPct}%` }} />
            </div>
            <p className="mt-1.5 text-[12.5px] text-ink-2">
              <b className="text-ink">{100 - cover.servedPct}% new ground</b> · {cover.servedPct}% already within {SERVICE_KM} km of one of our stores
            </p>
          </div>
        )}

        <div className="mx-4 mt-3 grid grid-cols-2 gap-2 text-[12.5px]">
          <Fact label="Footfall" value="Not in the file" note="add a footfall column to show it" />
          <Fact label="Competitor brands" value="Not in the file" note="no rival store list in the data" />
        </div>

        {rivals.length > 0 && (
          <div className="mx-4 mt-3 rounded-xl border border-white/10 p-3">
            <p className="mb-1.5 text-[12.5px] font-semibold text-ink">Also applying for {t?.id}</p>
            <ul className="grid gap-1 text-[12.5px]">
              {rivals.map((r) => (
                <li key={r.key} className="flex items-center gap-2">
                  <i className="size-2 shrink-0 rounded-full" style={{ background: STATUS_HEX[r.status] }} />
                  <span className="min-w-0 flex-1 truncate text-ink">{r.name || r.id}</span>
                  <span className="num text-muted">{r.score?.total ?? "–"}</span>
                  <span className="w-[86px] text-right text-[11.5px] text-ink-2">{STATUS_LABEL[r.status]}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mx-4 mt-3 rounded-xl border border-[#8f7cff55] bg-[#8f7cff10] p-3">
          <p className="text-[12.5px] font-semibold text-[#c9bfff]">Insight</p>
          {decision.score && (
            <p className="num mt-1 text-[13px] text-ink">
              Score {decision.score.total}
              {decision.rank ? ` · ranked ${decision.rank.k} of ${decision.rank.n} in ${decision.territoryId}` : ""}
            </p>
          )}
          <p className="mt-1 text-[13px] leading-snug text-ink">
            <span className="text-muted">Next step: </span>
            {decision.nextStep}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 px-4 py-3">
          <button type="button" onClick={onFullDecision} className="neon-btn rounded-lg px-3 py-1.5 text-[12.5px] font-semibold">
            Full decision
          </button>
          {c && (
            <a href={`https://www.google.com/maps/search/?api=1&query=${q}`} target="_blank" rel="noreferrer" className="rounded-lg border border-white/15 px-3 py-1.5 text-[12.5px] font-medium text-ink hover:border-neon">
              Open in Google Maps ↗
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

function Fact({ label, value, note, testid }: { label: string; value: string; note?: string; testid?: string }) {
  return (
    <div className="rounded-xl border border-white/10 px-3 py-2">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="num whitespace-pre-line text-[13px] font-medium text-ink" data-testid={testid}>
        {value}
      </dd>
      {note && <dd className="text-[11px] text-muted">{note}</dd>}
    </div>
  );
}
