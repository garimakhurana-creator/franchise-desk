// Workbook -> Dataset. Pure: takes sheets as arrays of rows (from SheetJS or tests).
import {
  cellText,
  normaliseHeader,
  normaliseId,
  parseFloor,
  parseLakh,
  parseLanguage,
  parsePin,
  parsePinList,
  parsePlainNumber,
  parsePriority,
  parseSize,
  parseSpace,
  parseTarget,
  parseTier,
} from "../engine/normalise";
import reference from "../engine/reference.json";
import type { Application, Dataset, Issue, Store, Territory } from "../engine/types";

export interface SheetData {
  name: string;
  rows: unknown[][];
  firstRow?: number; // 1-based sheet row of rows[0]
}

export class ParseError extends Error {}

const APP_COLS: Record<string, string[]> = {
  id: ["application id", "app id", "application no", "id"],
  name: ["applicant name", "name", "applicant"],
  city: ["city"],
  state: ["state"],
  pin: ["pin code", "pincode", "pin", "postal code"],
  invest: ["investment capacity", "investment", "capital"],
  experience: ["retail experience", "experience"],
  business: ["current past business", "current business", "business", "past business"],
  space: ["space available", "space"],
  size: ["space size", "size"],
  floor: ["floor"],
  target: ["target launch", "target", "launch"],
  language: ["preferred language", "language"],
  notes: ["notes from applicant", "notes", "remarks", "comments"],
};

const TER_COLS: Record<string, string[]> = {
  id: ["territory id", "territory", "id"],
  city: ["city"],
  state: ["state"],
  pins: ["pin codes covered", "pin codes", "pins", "pincodes"],
  tier: ["city tier", "tier"],
  slots: ["open slots", "slots"],
  priority: ["priority"],
};

const STORE_COLS: Record<string, string[]> = {
  id: ["store id", "store", "id"],
  city: ["city"],
  pin: ["pin code", "pincode", "pin"],
  year: ["opened", "year", "opened year"],
};

function findSheet(sheets: SheetData[], words: string[], headerKey: string): SheetData | null {
  const byName = sheets.find((s) => words.some((w) => s.name.toLowerCase().replace(/[^a-z]/g, "").includes(w)));
  if (byName && findHeaderRow(byName, headerKey) >= 0) return byName;
  return sheets.find((s) => findHeaderRow(s, headerKey) >= 0) ?? null;
}

function findHeaderRow(sheet: SheetData, key: string): number {
  const k = normaliseHeader(key);
  for (let i = 0; i < Math.min(15, sheet.rows.length); i++) {
    const row = sheet.rows[i] ?? [];
    if (row.some((c) => normaliseHeader(cellText(c)) === k)) return i;
  }
  return -1;
}

function mapColumns(header: unknown[], spec: Record<string, string[]>): Record<string, number> {
  const norm = header.map((h) => normaliseHeader(cellText(h)));
  const out: Record<string, number> = {};
  const used = new Set<number>();
  // exact matches first, then prefix matches, so "space size" never steals "space"
  for (const pass of [0, 1] as const) {
    for (const [field, names] of Object.entries(spec)) {
      if (field in out) continue;
      for (const name of names) {
        const idx = norm.findIndex((h, i) => !used.has(i) && (pass === 0 ? h === name : h.startsWith(name)));
        if (idx >= 0) {
          out[field] = idx;
          used.add(idx);
          break;
        }
      }
    }
  }
  return out;
}

const isBlank = (row: unknown[]) => !row || row.every((c) => cellText(c) === "");

export function parseWorkbook(sheets: SheetData[], fileName = "upload.xlsx", source: "upload" | "sample" = "upload"): Dataset {
  const notes: Issue[] = [];
  const rowsIgnored: Dataset["rowsIgnored"] = [];

  const appSheet = findSheet(sheets, ["application"], "Application ID");
  const terSheet = findSheet(sheets, ["territor"], "Territory ID");
  const missing: string[] = [];
  if (!appSheet) missing.push('an "Applications" sheet with an "Application ID" header');
  if (!terSheet) missing.push('a "Territories" sheet with a "Territory ID" header');
  if (missing.length) throw new ParseError(`This file is missing ${missing.join(" and ")}. Use the case template layout and upload again.`);

  // ---------- Territories ----------
  const terHeaderIdx = findHeaderRow(terSheet!, "Territory ID");
  const tcols = mapColumns(terSheet!.rows[terHeaderIdx], TER_COLS);
  for (const f of ["pins", "slots"]) if (!(f in tcols)) notes.push({ sheet: "Territories", message: `Column "${f === "pins" ? "Pin codes covered" : "Open slots"}" not found; values treated as blank.`, severity: "error" });
  const terOffset = terSheet!.firstRow ?? 1;
  let territories: Territory[] = [];
  for (let i = terHeaderIdx + 1; i < terSheet!.rows.length; i++) {
    const r = terSheet!.rows[i] ?? [];
    const rowNo = i + terOffset;
    if (isBlank(r)) continue;
    const id = cellText(r[tcols.id]);
    if (!id) {
      rowsIgnored.push({ sheet: "Territories", row: rowNo, reason: "no Territory ID" });
      continue;
    }
    const { pins, bad } = parsePinList(r[tcols.pins]);
    if (bad.length) notes.push({ sheet: "Territories", row: rowNo, id, message: `${id}: ignored unreadable pin entries ${bad.map((b) => `"${b}"`).join(", ")}.`, severity: "warn" });
    const slotsN = parsePlainNumber(r[tcols.slots]);
    let slots = slotsN.value;
    if (slots !== null && (slots < 0 || !Number.isFinite(slots))) {
      notes.push({ sheet: "Territories", row: rowNo, id, message: `${id}: open slots "${cellText(r[tcols.slots])}" is not valid; treated as 0.`, severity: "warn" });
      slots = 0;
    }
    if (slots === null) notes.push({ sheet: "Territories", row: rowNo, id, message: `${id}: open slots missing; treated as 0.`, severity: "warn" });
    territories.push({
      key: normaliseId(id),
      id,
      row: rowNo,
      city: cellText(r[tcols.city]) || null,
      state: cellText(r[tcols.state]) || null,
      pins,
      tier: parseTier(r[tcols.tier]),
      slots: slots === null ? 0 : Math.floor(slots),
      priority: parsePriority(r[tcols.priority]),
    });
  }
  territories = dropTemplateExample(territories, "Territories", notes, rowsIgnored, (t) => t.key === "TER-1" && (t.city ?? "").toLowerCase() === "mysuru" && t.pins.join(",") === "570001,570002,570008");
  territories = dedupe(territories, "Territories", notes, rowsIgnored, (a, b) => JSON.stringify({ ...a, row: 0 }) === JSON.stringify({ ...b, row: 0 }));

  // ---------- Applications ----------
  const appHeaderIdx = findHeaderRow(appSheet!, "Application ID");
  const acols = mapColumns(appSheet!.rows[appHeaderIdx], APP_COLS);
  for (const f of ["pin", "invest", "space"]) if (!(f in acols)) notes.push({ sheet: "Applications", message: `Column for "${f}" not found; every application will need that detail.`, severity: "error" });
  const appOffset = appSheet!.firstRow ?? 1;
  let applications: Application[] = [];
  for (let i = appHeaderIdx + 1; i < appSheet!.rows.length; i++) {
    const r = appSheet!.rows[i] ?? [];
    const rowNo = i + appOffset;
    if (isBlank(r)) continue;
    const id = cellText(r[acols.id]);
    if (!id) {
      rowsIgnored.push({ sheet: "Applications", row: rowNo, reason: "no Application ID" });
      continue;
    }
    applications.push(readApplication(r, acols, id, rowNo, notes));
  }
  applications = dropTemplateExample(applications, "Applications", notes, rowsIgnored, (a) => a.key === "APP-1" && a.name.toLowerCase().replace(/\s+/g, " ") === "ravi kumar" && a.pin === "570001" && /footwear/i.test(a.business));
  applications = dedupe(applications, "Applications", notes, rowsIgnored, (a, b) => JSON.stringify({ ...a, row: 0, fieldFlags: [] }) === JSON.stringify({ ...b, row: 0, fieldFlags: [] }));

  // ---------- Existing stores ----------
  let stores: Store[] = [];
  const storeSheet = findSheet(sheets, ["existing", "store"], "Store ID");
  if (storeSheet) {
    const hi = findHeaderRow(storeSheet, "Store ID");
    const scols = mapColumns(storeSheet.rows[hi], STORE_COLS);
    for (let i = hi + 1; i < storeSheet.rows.length; i++) {
      const r = storeSheet.rows[i] ?? [];
      if (isBlank(r)) continue;
      const id = cellText(r[scols.id]);
      const pin = parsePin(r[scols.pin]).pin;
      if (!id || !pin) continue;
      const yr = parsePlainNumber(r[scols.year]).value;
      stores.push({ id, city: cellText(r[scols.city]), pin, year: yr === null ? null : Math.round(yr) });
    }
  }
  if (!stores.length) {
    stores = reference.stores.map((s) => ({ ...s }));
    notes.push({ sheet: "Existing stores", message: "No Existing stores sheet found, so the fixed list of 10 stores from the case template was used.", severity: "info" });
  }

  // ---------- Allowed values (city -> pin prefix -> tier) ----------
  let cities: Dataset["cities"];
  const allowed = findSheet(sheets, ["allowed"], "Pin codes start with");
  if (allowed) {
    const hi = findHeaderRow(allowed, "Pin codes start with");
    const ccols = mapColumns(allowed.rows[hi], { city: ["city"], state: ["state"], prefix: ["pin codes start with"], tier: ["city tier", "tier"] });
    const list: NonNullable<Dataset["cities"]> = [];
    for (let i = hi + 1; i < allowed.rows.length; i++) {
      const r = allowed.rows[i] ?? [];
      const city = cellText(r[ccols.city]);
      const prefix = cellText(r[ccols.prefix]).replace(/\D/g, "");
      const tier = parseTier(r[ccols.tier]);
      if (city && prefix.length === 3 && tier) list.push({ city, state: cellText(r[ccols.state]) || undefined, prefix, tier });
    }
    if (list.length) cities = list;
  }
  if (!cities) {
    cities = reference.cities.map((c) => ({ ...c, tier: c.tier as 1 | 2 | 3 }));
    notes.push({ sheet: "Allowed values", message: "No Allowed values sheet found, so the city, pin-prefix and tier list from the case template was used.", severity: "info" });
  }

  // ---------- Cross-sheet checks ----------
  const pinOwner = new Map<string, string[]>();
  for (const t of territories) for (const p of t.pins) pinOwner.set(p, [...(pinOwner.get(p) ?? []), t.id]);
  for (const [p, ids] of pinOwner) if (ids.length > 1) notes.push({ sheet: "Territories", message: `Pin ${p} appears in ${ids.join(" and ")}; it is counted in ${[...ids].sort((a, b) => normaliseId(a).localeCompare(normaliseId(b)))[0]} only.`, severity: "warn" });
  const storePins = new Map(stores.map((s) => [s.pin, s.id]));
  for (const t of territories) {
    const held = t.pins.filter((p) => storePins.has(p));
    if (held.length) notes.push({ sheet: "Territories", id: t.id, message: `${t.id}: pin ${held.map((p) => `${p} (${storePins.get(p)})`).join(", ")} already has our store, so ${t.pins.length - held.length} of ${t.pins.length} pins are free.`, severity: "info" });
  }

  return {
    cities,
    applications,
    territories,
    stores,
    notes,
    source,
    fileName,
    rowsRead: applications.length + territories.length,
    rowsIgnored,
  };
}

function readApplication(r: unknown[], c: Record<string, number>, id: string, rowNo: number, notes: Issue[]): Application {
  const fieldFlags: Application["fieldFlags"] = [];
  const note = (field: string, message: string, severity: Issue["severity"] = "warn") => {
    fieldFlags.push({ field, message });
    notes.push({ sheet: "Applications", row: rowNo, id, field, message: `${id}: ${message}.`, severity });
  };
  const get = (f: string) => (f in c ? r[c[f]] : undefined);

  const pinR = parsePin(get("pin"));
  const inv = parseLakh(get("invest"));
  if (inv.flag) note("invest", inv.flag, inv.kind === "unparseable" || inv.kind === "negative" ? "warn" : "info");
  const exp = parsePlainNumber(get("experience"));
  if (exp.flag) note("experience", exp.flag);
  const size = parseSize(get("size"));
  if (size.flag) note("size", size.flag, size.kind === "converted" ? "info" : "warn");
  const tgt = parseTarget(get("target"));
  if (tgt.flag) note("targetMonths", tgt.flag, "info");
  const spaceRaw = cellText(get("space"));
  const space = parseSpace(spaceRaw);
  if (spaceRaw && !space) note("space", `space "${spaceRaw}" not recognised`);
  else if (space && spaceRaw && normaliseCanon(spaceRaw) !== normaliseCanon(space === "None" ? "Not yet identified" : space)) note("space", `space "${spaceRaw}" read as ${space === "None" ? "Not yet identified" : space}`, "info");
  const floorRaw = cellText(get("floor"));
  const floor = parseFloor(floorRaw);
  if (floorRaw && !floor) note("floor", `floor "${floorRaw}" not recognised`);
  const langRaw = cellText(get("language"));
  const language = parseLanguage(langRaw);
  if (langRaw && !language) note("language", `language "${langRaw}" not recognised; English used for messages`, "info");

  return {
    key: normaliseId(id),
    id,
    row: rowNo,
    name: cellText(get("name")),
    city: cellText(get("city")) || null,
    state: cellText(get("state")) || null,
    pin: pinR.pin,
    pinRaw: cellText(get("pin")),
    invest: inv.kind === "negative" ? null : inv.value,
    investRaw: cellText(get("invest")),
    experience: exp.kind === "negative" ? null : exp.value,
    business: cellText(get("business")),
    space,
    spaceRaw,
    size: size.kind === "negative" ? null : size.value,
    sizeRaw: cellText(get("size")),
    floor,
    floorRaw,
    targetMonths: tgt.kind === "negative" ? null : tgt.value,
    targetRaw: cellText(get("target")),
    language,
    notes: cellText(get("notes")),
    fieldFlags: fieldFlags.map((f) => ({ ...f, code: undefined })),
    provenance: {},
  };
}

const normaliseCanon = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

function dropTemplateExample<T extends { key: string; id: string; row: number }>(
  rows: T[],
  sheet: string,
  notes: Issue[],
  ignored: Dataset["rowsIgnored"],
  isExample: (t: T) => boolean,
): T[] {
  const first = rows[0];
  if (!first || !isExample(first)) return rows;
  const other = rows.slice(1).find((t) => t.key === first.key);
  if (other) {
    ignored.push({ sheet, row: first.row, reason: `template example row (${first.id}); a real ${other.id} exists in row ${other.row}` });
    notes.push({ sheet, row: first.row, message: `Row ${first.row} is the grey template example (${first.id}). It was dropped because row ${other.row} has a real ${other.id}.`, severity: "info" });
    return rows.slice(1);
  }
  notes.push({ sheet, row: first.row, message: `Row ${first.row} matches the template example (${first.id}). It was kept because no other ${first.id} exists.`, severity: "info" });
  return rows;
}

function dedupe<T extends { key: string; id: string; row: number }>(
  rows: T[],
  sheet: string,
  notes: Issue[],
  ignored: Dataset["rowsIgnored"],
  identical: (a: T, b: T) => boolean,
): T[] {
  const out: T[] = [];
  const seen = new Map<string, T[]>();
  for (const r of rows) {
    const prior = seen.get(r.key) ?? [];
    const twin = prior.find((p) => identical(p, r));
    if (twin) {
      ignored.push({ sheet, row: r.row, reason: `exact duplicate of row ${twin.row} (${r.id})` });
      notes.push({ sheet, row: r.row, message: `Row ${r.row} repeats row ${twin.row} (${r.id}) exactly, so it was counted once.`, severity: "info" });
      continue;
    }
    if (prior.length) {
      notes.push({ sheet, row: r.row, id: r.id, message: `${r.id} is used on rows ${[...prior.map((p) => p.row), r.row].join(" and ")} with different details. Both rows are kept and labelled by row.`, severity: "warn" });
      const n = prior.length + 1;
      (r as { key: string }).key = `${r.key}#${n}`;
      (r as { id: string }).id = `${r.id} (row ${r.row})`;
    }
    seen.set(r.key.split("#")[0], [...prior, r]);
    out.push(r);
  }
  return out;
}
