// Core types for the deterministic engine. Pure data, no I/O.
import type { ReasonCode } from "./codes";

export type Status = "APPROVED" | "CONDITIONAL" | "ON_HOLD" | "WAITLISTED" | "DECLINED" | "WITHDRAWN";
export const STATUSES: Status[] = ["APPROVED", "CONDITIONAL", "ON_HOLD", "WAITLISTED", "DECLINED", "WITHDRAWN"];

export type Tier = 1 | 2 | 3;
export type SpaceKind = "Owned" | "Rented" | "None";
export type Floor = "Ground" | "Upper" | "Mall" | "Unknown";
export type Lang = "Kannada" | "English" | "Hindi";
export type Priority = "High" | "Medium" | "Low";
export type Owner = "Applicant" | "Expansion" | "Field" | "Training" | "Supply chain" | "Legal";
export type Provenance = "declared" | "claimed" | "verified";

export interface Issue {
  sheet: string;
  row?: number;
  id?: string;
  field?: string;
  message: string;
  severity: "info" | "warn" | "error";
  code?: ReasonCode;
}

export interface Application {
  key: string; // normalised ID for matching
  id: string; // as written in the file
  row: number;
  name: string;
  city: string | null;
  state: string | null;
  pin: string | null;
  pinRaw: string;
  invest: number | null; // ₹ lakh
  investRaw: string;
  experience: number | null;
  business: string;
  space: SpaceKind | null;
  spaceRaw: string;
  size: number | null;
  sizeRaw: string;
  floor: Floor | null;
  floorRaw: string;
  targetMonths: number | null;
  targetRaw: string;
  language: Lang | null;
  notes: string;
  /** Field-level parse flags, e.g. investment given as a range. */
  fieldFlags: { field: string; code?: ReasonCode; message: string }[];
  provenance: Partial<Record<FactField, Provenance>>;
  withdrawn?: boolean;
}

export type FactField = "pin" | "city" | "invest" | "experience" | "space" | "size" | "floor" | "targetMonths" | "language" | "notes";

export interface Territory {
  key: string;
  id: string;
  row: number;
  city: string | null;
  state: string | null;
  pins: string[];
  tier: Tier | null;
  slots: number | null;
  priority: Priority | null;
}

export interface Store {
  id: string;
  city: string;
  pin: string;
  year: number | null;
}

export interface CityRef {
  city: string;
  state?: string;
  prefix: string;
  tier: Tier;
}

export interface Dataset {
  cities?: CityRef[];
  applications: Application[];
  territories: Territory[];
  stores: Store[];
  notes: Issue[];
  source: "upload" | "sample";
  fileName: string;
  rowsRead: number;
  rowsIgnored: { sheet: string; row: number; reason: string }[];
}

export interface ScoreComponent {
  key: "capital" | "experience" | "space" | "timeline" | "territory";
  label: string;
  value: number;
  max: number;
  note: string;
}

export interface Score {
  total: number;
  components: ScoreComponent[];
}

export interface Capex {
  tier: Tier;
  sizeUsed: number;
  sizeAssumed: boolean;
  fitoutPerSqft: number;
  stockPerSqft: number;
  fitoutStock: number; // ₹ lakh
  franchiseFee: number;
  deposit: number;
  runway: number;
  buffer: number;
  required: number;
  invest: number | null;
  ratio: number | null;
  monthlyRent: number;
}

export interface Nearest {
  storeId: string;
  pin: string;
  year: number | null;
  km: number | null;
  pinGap: number;
  basis: "km" | "pin-proxy";
  risk: "high" | "medium" | "low";
  weight: number;
  penalty: number;
}

export interface Flag {
  code: ReasonCode;
  text: string; // plain language
  evidence?: string; // quote or fact
  provenance?: Provenance;
  task?: string; // verification task
  owner?: Owner;
}

export interface Ask {
  what: string;
  from: Owner;
}

export interface PlanStep {
  week: number; // start week (1-based)
  weeks: number;
  label: string;
  owner: Owner;
}

export interface Plan {
  steps: PlanStep[];
  totalWeeks: number;
  readyDate: string; // ISO date
  targetDate: string | null;
  feasible: boolean;
  earliestMonth: string;
  documents: string[];
  training: { track: string; weeks: number; language: Lang; mode: string; buddyStore: string | null; buddyReason: string };
  supply: { hub: string; leadDays: number; safetyStockDays: number; cluster: string; note: string };
  payback: { months: number | null; flagged: boolean; monthlyNet: number; revenue: number };
}

export interface Counterfactual {
  change: string;
  newStatus: Status;
}

export interface Stability {
  label: "robust" | "borderline";
  flip: string;
  heldPct?: number;
}

export interface Decision {
  key: string;
  id: string;
  name: string;
  status: Status;
  codes: ReasonCode[]; // primary first
  flags: Flag[];
  territoryKey: string | null;
  territoryId: string | null;
  pin: string | null;
  allocatedPin: string | null;
  ready: boolean;
  score: Score | null;
  scoreProvisional: boolean;
  bar: number | null;
  rank: { k: number; n: number } | null;
  queuePos: number | null;
  ahead: string[];
  capex: Capex | null;
  nearest: Nearest | null;
  competitors: { id: string; key: string; score: number | null; status?: Status }[];
  contested?: { against: string; gap: number };
  redirect: string | null;
  freePinsOffered: string[];
  why: string; // the one-liner
  detail: string[]; // further plain-language reasoning
  nextStep: string;
  owner: Owner;
  asks: Ask[];
  plan: Plan | null;
  pinned: boolean;
  promoted?: boolean;
  handling?: string;
  counterfactual?: Counterfactual | null;
  stability?: Stability;
}

export interface TerritorySummary {
  key: string;
  id: string;
  city: string | null;
  tier: Tier | null;
  priority: Priority | null;
  slots: number;
  pins: string[];
  storePins: { pin: string; storeId: string }[];
  freePins: string[];
  effectiveCapacity: number;
  bindingReason: string | null;
  approved: string[];
  conditional: string[];
  waitlisted: string[];
  onHold: string[];
  unusedCapacity: number;
}

export interface RunContext {
  today: string; // ISO date, supplied by caller (never read inside the engine)
  pinned: Record<string, string>; // applicant key -> pin (approved partners locked in)
  swapNotes?: Record<string, string>; // displaced key -> displacing ID
  dayOffset?: number; // simulate N days passing
  lapsed?: string[]; // keys whose 30-day conditional reservation lapsed
  closedHolds?: string[]; // keys whose hold closed after 14 days of silence
  previous?: Record<string, Status>; // statuses before this re-run (for "promoted" wording)
  simulation?: boolean;
}

export interface RunResult {
  decisions: Decision[];
  territories: TerritorySummary[];
  runId: string;
  policyVersion: string;
  pinConflicts: number;
  asOf: string;
  notes: string[];
}
