// One coherent custom icon set: 16px grid, 1.5px strokes, round joins.
import type { Status } from "@/lib/engine/types";

type P = { size?: number; className?: string; title?: string };
const S = ({ size = 16, className, title, children }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
    {title ? <title>{title}</title> : null}
    {children}
  </svg>
);

export const STATUS_LABEL: Record<Status, string> = {
  APPROVED: "Approved",
  CONDITIONAL: "Conditional",
  ON_HOLD: "On hold",
  WAITLISTED: "Waitlisted",
  DECLINED: "Declined",
  WITHDRAWN: "Withdrawn",
};

export const STATUS_VAR: Record<Status, string> = {
  APPROVED: "var(--approved)",
  CONDITIONAL: "var(--conditional)",
  ON_HOLD: "var(--hold)",
  WAITLISTED: "var(--wait)",
  DECLINED: "var(--declined)",
  WITHDRAWN: "var(--withdrawn)",
};

/** Status shapes: solid disc with tick, hatched disc, pause bars, queue lines, crossed ring, dashed ring. */
export function StatusGlyph({ status, size = 14 }: { status: Status; size?: number }) {
  const c = STATUS_VAR[status];
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden style={{ color: c, flex: "none" }}>
      {status === "APPROVED" && (
        <>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="M4.8 8.2l2.1 2.1 4.3-4.6" stroke="var(--surface)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {status === "CONDITIONAL" && (
        <>
          <defs>
            <pattern id="hatch-c" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="1.4" height="3" fill="currentColor" />
            </pattern>
          </defs>
          <circle cx="8" cy="8" r="6.6" fill="url(#hatch-c)" stroke="currentColor" strokeWidth="1.4" />
        </>
      )}
      {status === "ON_HOLD" && (
        <>
          <rect x="1.5" y="1.5" width="13" height="13" rx="3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6.2 5v6M9.8 5v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}
      {status === "WAITLISTED" && (
        <>
          <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M5 6h6M5 8.2h4.4M5 10.4h2.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}
      {status === "DECLINED" && (
        <>
          <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}
      {status === "WITHDRAWN" && <circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.2 2.2" />}
    </svg>
  );
}

export function StatusChip({ status, size = "md" }: { status: Status; size?: "sm" | "md" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap ${size === "sm" ? "text-[12px] px-2 py-0.5" : "text-[13px] px-2.5 py-1"}`}
      style={{ color: STATUS_VAR[status], background: `color-mix(in srgb, ${STATUS_VAR[status]} 13%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${STATUS_VAR[status]} 35%, transparent)` }}
    >
      <StatusGlyph status={status} size={size === "sm" ? 12 : 13} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export const Icon = {
  Upload: (p: P) => (
    <S {...p}>
      <path d="M8 10.5V2.5M5 5.5l3-3 3 3M2.5 10.5v2a1 1 0 001 1h9a1 1 0 001-1v-2" />
    </S>
  ),
  Download: (p: P) => (
    <S {...p}>
      <path d="M8 2.5v8M5 7.5l3 3 3-3M2.5 10.5v2a1 1 0 001 1h9a1 1 0 001-1v-2" />
    </S>
  ),
  Sliders: (p: P) => (
    <S {...p}>
      <path d="M3 4h6M12 4h1M3 8h1M7 8h6M3 12h7M13 12h0" />
      <circle cx="10.5" cy="4" r="1.5" />
      <circle cx="5.5" cy="8" r="1.5" />
      <circle cx="11.5" cy="12" r="1.5" />
    </S>
  ),
  Book: (p: P) => (
    <S {...p}>
      <path d="M2.5 3.5c2-.8 3.8-.6 5.5.6 1.7-1.2 3.5-1.4 5.5-.6v9c-2-.8-3.8-.6-5.5.6-1.7-1.2-3.5-1.4-5.5-.6z" />
      <path d="M8 4.1v9" />
    </S>
  ),
  Notes: (p: P) => (
    <S {...p}>
      <rect x="3" y="2.5" width="10" height="11" rx="1.5" />
      <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" />
    </S>
  ),
  Sun: (p: P) => (
    <S {...p}>
      <circle cx="8" cy="8" r="2.8" />
      <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" />
    </S>
  ),
  Moon: (p: P) => (
    <S {...p}>
      <path d="M13 9.6A5.5 5.5 0 016.4 3a5.5 5.5 0 106.6 6.6z" />
    </S>
  ),
  Close: (p: P) => (
    <S {...p}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </S>
  ),
  Send: (p: P) => (
    <S {...p}>
      <path d="M2.5 8h9M8 4.5L11.5 8 8 11.5" />
      <path d="M13.5 3v10" />
    </S>
  ),
  Copy: (p: P) => (
    <S {...p}>
      <rect x="5" y="5" width="8.5" height="8.5" rx="1.5" />
      <path d="M3.5 10.5h-.5a.5.5 0 01-.5-.5V3a.5.5 0 01.5-.5h7a.5.5 0 01.5.5v.5" />
    </S>
  ),
  Check: (p: P) => (
    <S {...p}>
      <path d="M3.5 8.5l3 3 6-7" />
    </S>
  ),
  Lock: (p: P) => (
    <S {...p}>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
    </S>
  ),
  Swap: (p: P) => (
    <S {...p}>
      <path d="M3 5.5h9.5M10 3l2.5 2.5L10 8M13 10.5H3.5M6 8l-2.5 2.5L6 13" />
    </S>
  ),
  Undo: (p: P) => (
    <S {...p}>
      <path d="M5.5 4L2.5 7l3 3" />
      <path d="M2.5 7h7a4 4 0 010 8H8" />
    </S>
  ),
  Pin: (p: P) => (
    <S {...p}>
      <path d="M8 14s4.5-4.2 4.5-7.5a4.5 4.5 0 00-9 0C3.5 9.8 8 14 8 14z" />
      <circle cx="8" cy="6.5" r="1.6" />
    </S>
  ),
  Store: (p: P) => (
    <S {...p}>
      <path d="M2.5 6.5l1-3.5h9l1 3.5M3.5 6.5v7h9v-7" />
      <path d="M2.5 6.5c0 1 .9 1.5 1.8 1.5S6 7.5 6 6.5c0 1 .9 1.5 2 1.5s2-.5 2-1.5c0 1 .8 1.5 1.7 1.5s1.8-.5 1.8-1.5" />
    </S>
  ),
  Spark: (p: P) => (
    <S {...p}>
      <path d="M8 2v3M8 11v3M2 8h3M11 8h3M4 4l1.8 1.8M10.2 10.2L12 12M4 12l1.8-1.8M10.2 5.8L12 4" />
    </S>
  ),
  Table: (p: P) => (
    <S {...p}>
      <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
      <path d="M2.5 6.5h11M2.5 10h11M6.5 6.5V13" />
    </S>
  ),
  Map: (p: P) => (
    <S {...p}>
      <path d="M2.5 4l3.5-1.5 4 1.5 3.5-1.5v9.5L10 13.5 6 12l-3.5 1.5z" />
      <path d="M6 2.5V12M10 4v9.5" />
    </S>
  ),
  Shield: (p: P) => (
    <S {...p}>
      <path d="M8 2l5 2v4c0 3-2.2 5.2-5 6-2.8-.8-5-3-5-6V4z" />
      <path d="M5.8 8.2l1.6 1.6 3-3.2" />
    </S>
  ),
  Clock: (p: P) => (
    <S {...p}>
      <circle cx="8" cy="8" r="5.8" />
      <path d="M8 4.8V8l2.2 1.6" />
    </S>
  ),
  Search: (p: P) => (
    <S {...p}>
      <circle cx="7" cy="7" r="4.2" />
      <path d="M10.2 10.2L13.5 13.5" />
    </S>
  ),
  Chevron: (p: P) => (
    <S {...p}>
      <path d="M6 4l4 4-4 4" />
    </S>
  ),
};
