"use client";
// Key for the overview pins: the number in a pin is its new requests; grey means no open territory there.
import type { MapPoint } from "@/lib/map/terrain";

function MiniPin({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <span className={`dio-tag pointer-events-none${muted ? " is-orphan" : ""}`} style={{ position: "relative", animation: "none" }} aria-hidden>
      <span className="dp-pin" style={{ height: 24 }}>
        <span className="dp-head">
          <span className="dp-num">{label}</span>
        </span>
      </span>
    </span>
  );
}

export function PinLegend({ points, sample, corner = "left" }: { points: MapPoint[]; sample?: boolean; corner?: "left" | "right" }) {
  const counted = points.some((p) => p.count !== undefined);
  const muted = points.some((p) => p.muted);
  if (!counted) return null;
  return (
    <div className={`pointer-events-none absolute z-[3] ${corner === "left" ? "left-3 top-12" : "right-3 top-3"} flex flex-col gap-1 rounded-lg border border-white/10 bg-[#0d0d14cc] px-2.5 py-2 text-[12px] text-white/85 backdrop-blur`} aria-label="Map key">
      <div className="flex items-center gap-2">
        <MiniPin label="3" />
        <span>
          <b className="text-white">New requests</b> in that place{sample ? " (sample file)" : ""}
        </span>
      </div>
      {muted && (
        <div className="flex items-center gap-2">
          <MiniPin label="1" muted />
          <span>Requests where no territory is open</span>
        </div>
      )}
    </div>
  );
}
