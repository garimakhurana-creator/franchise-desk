import { describe, expect, it } from "vitest";
import { loadXlsx, TODAY } from "./helpers";
import { run, DEFAULT_POLICY, type Decision, type Dataset } from "@/lib/engine";
import { newSession, replay, diff, type Session } from "@/lib/engine/session";

const ds = loadXlsx("golden/golden.xlsx");
const base = () => run(ds, DEFAULT_POLICY, { today: TODAY, pinned: {} });
const byId = (ds2: Decision[], id: string) => ds2.find((d) => d.key === id.replace(/-0+/, "-"))!;
const text = (d: Decision) => [d.why, d.nextStep, ...d.detail].join(" ");

describe("golden statuses (GOLDEN.md)", () => {
  const r = base();
  const D = (id: string) => byId(r.decisions, id);

  it("APP-001 approved at 570001", () => {
    expect(D("APP-001").status).toBe("APPROVED");
    expect(D("APP-001").allocatedPin).toBe("570001");
  });
  it("APP-002 waitlisted behind APP-001 with gap and a free alternative", () => {
    const d = D("APP-002");
    expect(d.status).toBe("WAITLISTED");
    expect(d.codes.some((c) => c === "PIN_TAKEN" || c === "SLOTS_FULL")).toBe(true);
    expect(d.why).toContain("APP-001");
    expect(d.why).toMatch(/score \d+ vs \d+/);
    expect(d.freePinsOffered.length).toBeGreaterThan(0);
    expect(text(d)).toContain(d.freePinsOffered[0]);
  });
  it("APP-003 approved at 570004", () => {
    expect(D("APP-003").status).toBe("APPROVED");
    expect(D("APP-003").allocatedPin).toBe("570004");
  });
  it("APP-004 held: store ST-06 at its pin, free pins listed, provisional score, would win", () => {
    const d = D("APP-004");
    expect(d.status).toBe("ON_HOLD");
    expect(d.codes).toContain("PIN_HAS_STORE");
    expect(d.why).toContain("ST-06");
    expect(text(d)).toMatch(/570002/);
    expect(text(d)).toMatch(/570008/);
    expect(text(d)).toMatch(/provisional score \d+/);
    expect(d.rank?.k).toBe(1);
  });
  it("APP-005 held: Mysuru vs Bengaluru, TER-02", () => {
    const d = D("APP-005");
    expect(d.status).toBe("ON_HOLD");
    expect(d.codes).toContain("CITY_PIN_MISMATCH");
    expect(d.why).toMatch(/Mysuru/);
    expect(d.why).toMatch(/Bengaluru/);
    expect(d.why).toMatch(/TER-02/);
  });
  it("APP-006 held: space contradiction, asks to confirm", () => {
    const d = D("APP-006");
    expect(d.status).toBe("ON_HOLD");
    expect(d.codes).toContain("SPACE_CONTRADICTION");
    expect(d.nextStep).toMatch(/confirm whether a space exists/i);
  });
  it("APP-007 held: size missing", () => {
    expect(D("APP-007").status).toBe("ON_HOLD");
    expect(D("APP-007").codes).toContain("SPACE_SIZE_MISSING");
  });
  it("APP-008 and APP-009 approved", () => {
    expect(D("APP-008").status).toBe("APPROVED");
    expect(D("APP-008").allocatedPin).toBe("560002");
    expect(D("APP-009").status).toBe("APPROVED");
    expect(D("APP-009").allocatedPin).toBe("560008");
  });
  it("APP-010 conditional on the leftover third slot, names next in line, lists site needs", () => {
    const d = D("APP-010");
    expect(d.status).toBe("CONDITIONAL");
    expect(d.why).toMatch(/slot 3 of 3/);
    expect(text(d)).toMatch(/next in line|No one is waiting/i);
    expect(text(d)).toMatch(/at least 400 sq ft/);
  });
  it("APP-011 approved at 575002", () => {
    expect(D("APP-011").status).toBe("APPROVED");
    expect(D("APP-011").allocatedPin).toBe("575002");
  });
  it("APP-012 waitlisted: TER-03 wants 2 but only 1 pin free", () => {
    const d = D("APP-012");
    expect(d.status).toBe("WAITLISTED");
    expect(d.why).toMatch(/wants 2 stores but only 1 pin is free/);
  });
  it("APP-013 declined: no territory in Davanagere", () => {
    const d = D("APP-013");
    expect(d.status).toBe("DECLINED");
    expect(d.codes).toContain("OUT_OF_TERRITORY");
    expect(d.why).toMatch(/Davanagere has no open territory/);
  });
  it("APP-014 declined: investment too low", () => {
    expect(D("APP-014").status).toBe("DECLINED");
    expect(D("APP-014").codes[0]).toBe("INVEST_LOW");
  });
  it("APP-015 declined: pin has store and TER-05 has no alternative", () => {
    expect(D("APP-015").status).toBe("DECLINED");
    expect(D("APP-015").codes[0]).toBe("PIN_HAS_STORE_NO_ALT");
    expect(r.territories.find((t) => t.id === "TER-05")!.effectiveCapacity).toBe(0);
  });
  it("APP-016 not allocated, injection flagged, note had no influence on score", () => {
    const d = D("APP-016");
    expect(["APPROVED", "CONDITIONAL"]).not.toContain(d.status);
    expect(d.codes).toContain("INJECTION");
    const clean: Dataset = { ...ds, applications: ds.applications.map((a) => (a.key === "APP-16" ? { ...a, notes: "" } : a)) };
    const r2 = run(clean, DEFAULT_POLICY, { today: TODAY, pinned: {} });
    expect(byId(r2.decisions, "APP-016").score!.total).toBe(d.score!.total);
    expect(byId(r2.decisions, "APP-016").status).toBe(d.status);
  });
  it("APP-017 held: unit error", () => {
    expect(D("APP-017").status).toBe("ON_HOLD");
    expect(D("APP-017").codes[0]).toBe("UNIT_ERROR");
    expect(D("APP-017").why).toMatch(/rupees/);
  });
  it("APP-018 approved or conditional with loan and a sanction-letter step", () => {
    const d = D("APP-018");
    expect(["APPROVED", "CONDITIONAL"]).toContain(d.status);
    expect(d.codes).toContain("LOAN_DEPENDENT");
    expect(text(d) + d.asks.map((a) => a.what).join(" ")).toMatch(/sanction letter/i);
  });
  it("APP-019 and APP-020: fuzzy identity, at most one allocated", () => {
    const a = D("APP-019");
    const b = D("APP-020");
    expect(["APPROVED", "CONDITIONAL"]).toContain(a.status);
    expect(a.codes).toContain("FUZZY_IDENTITY");
    expect(b.status).toBe("WAITLISTED");
    expect(b.codes).toContain("FUZZY_IDENTITY");
  });
  it("APP-021 and APP-022 held for the same property, naming each other, neutrally", () => {
    const a = D("APP-021");
    const b = D("APP-022");
    expect(a.status).toBe("ON_HOLD");
    expect(b.status).toBe("ON_HOLD");
    expect(a.codes[0]).toBe("SAME_PROPERTY_CLAIM");
    expect(a.why).toContain("APP-022");
    expect(b.why).toContain("APP-021");
    for (const d of [a, b]) expect(text(d)).not.toMatch(/fraud|collu|suspic|cheat|fake|lie/i);
  });
});

describe("golden invariants", () => {
  const check = (r: ReturnType<typeof base>) => {
    const pins = r.decisions.filter((d) => (d.status === "APPROVED" || d.status === "CONDITIONAL") && d.allocatedPin).map((d) => d.allocatedPin!);
    expect(new Set(pins).size).toBe(pins.length);
    const storePins = new Set(ds.stores.map((s) => s.pin));
    expect(pins.some((p) => storePins.has(p))).toBe(false);
    for (const t of r.territories) expect(t.approved.length + t.conditional.length).toBeLessThanOrEqual(t.effectiveCapacity);
    expect(r.pinConflicts).toBe(0);
  };
  it("pin rule, capacity and holds", () => check(base()));
  it("shuffled rows give identical statuses", () => {
    const r0 = base();
    const shuffled: Dataset = { ...ds, applications: [...ds.applications].reverse(), territories: [...ds.territories].reverse() };
    const r1 = run(shuffled, DEFAULT_POLICY, { today: TODAY, pinned: {} });
    for (const d of r0.decisions) expect(byId(r1.decisions, d.key).status).toBe(d.status);
    expect(r1.runId).toBe(r0.runId);
    check(r1);
  });
  it("lower-case IDs give identical statuses", () => {
    const r0 = base();
    const lower: Dataset = { ...ds, applications: ds.applications.map((a) => ({ ...a, id: a.id.toLowerCase() })) };
    const r1 = run(lower, DEFAULT_POLICY, { today: TODAY, pinned: {} });
    for (const d of r0.decisions) expect(byId(r1.decisions, d.key).status).toBe(d.status);
  });
  it("determinism: same input, same output", () => {
    expect(JSON.stringify(base())).toBe(JSON.stringify(base()));
  });
});

describe("golden follow-ups at engine level", () => {
  const s0 = (): Session => newSession(ds, DEFAULT_POLICY, TODAY);
  const last = (s: Session) => replay(s).at(-1)!.result;
  const at = "2026-10-25T09:00:00Z";

  it("F4: APP-007 gets a ready site -> approved, claim unverified, APP-010 waitlisted, pinned unchanged", () => {
    const s = s0();
    s.log.push({ at, update: { kind: "facts", key: "APP-7", changes: { space: "Owned", size: 480, floor: "Ground" }, text: "F4" } });
    const steps = replay(s);
    const r = steps.at(-1)!.result;
    const d = byId(r.decisions, "APP-007");
    expect(d.status).toBe("APPROVED");
    expect(d.codes).toContain("CLAIM_UNVERIFIED");
    expect(d.nextStep).toMatch(/verify/i);
    expect(byId(r.decisions, "APP-010").status).toBe("WAITLISTED");
    expect(byId(r.decisions, "APP-008").status).toBe("APPROVED");
    expect(byId(r.decisions, "APP-009").status).toBe("APPROVED");
    const ch = diff(steps[0].result, r);
    expect(ch.map((c) => c.id)).toEqual(expect.arrayContaining(["APP-007", "APP-010"]));
  });

  it("F5: APP-004 moves to 570008 -> contested, APP-003 stays approved, swap needs a person", () => {
    const s = s0();
    s.log.push({ at, update: { kind: "facts", key: "APP-4", changes: { pin: "570008" }, text: "F5" } });
    let r = last(s);
    const d = byId(r.decisions, "APP-004");
    expect(d.status).toBe("WAITLISTED");
    expect(d.queuePos).toBe(1);
    expect(d.codes).toContain("CONTESTED");
    expect(d.contested?.against).toBe("APP-003");
    expect(d.why).toMatch(/outranks approved partner APP-003 by \d+ points/);
    expect(byId(r.decisions, "APP-003").status).toBe("APPROVED");
    s.log.push({ at, update: { kind: "swap", challenger: "APP-4", displaced: "APP-3", text: "Confirm swap" } });
    r = last(s);
    expect(byId(r.decisions, "APP-004").status).toBe("APPROVED");
    const d3 = byId(r.decisions, "APP-003");
    expect(d3.status).toBe("WAITLISTED");
    expect(d3.handling).toMatch(/swap/);
    expect(byId(r.decisions, "APP-001").status).toBe("APPROVED");
  });

  it("F6: APP-001 withdraws -> APP-002 promoted; undo restores exactly", () => {
    const s = s0();
    const before = JSON.stringify(last(s));
    s.log.push({ at, update: { kind: "withdraw", key: "APP-1", text: "F6" } });
    const r = last(s);
    expect(byId(r.decisions, "APP-001").status).toBe("WITHDRAWN");
    const d2 = byId(r.decisions, "APP-002");
    expect(d2.status).toBe("APPROVED");
    expect(d2.promoted).toBe(true);
    expect(d2.why).toMatch(/promoted/);
    s.log.pop();
    expect(JSON.stringify(last(s))).toBe(before);
  });

  it("F7: TER-03 to 3 slots changes nothing; capacity still 1", () => {
    const s = s0();
    const b = last(s);
    s.log.push({ at, update: { kind: "territory", key: "TER-3", slots: 3, text: "F7" } });
    const r = last(s);
    expect(byId(r.decisions, "APP-012").status).toBe(byId(b.decisions, "APP-012").status);
    expect(r.territories.find((t) => t.id === "TER-03")!.effectiveCapacity).toBe(1);
  });

  it("F10: found a space, then lease fell through -> later message wins", () => {
    const s = s0();
    s.log.push({ at, update: { kind: "facts", key: "APP-7", changes: { space: "Owned", size: 480, floor: "Ground" }, text: "found" } });
    s.log.push({ at, update: { kind: "facts", key: "APP-7", changes: { space: "None", size: null, floor: null }, text: "fell through" } });
    const r = last(s);
    expect(["CONDITIONAL", "WAITLISTED"]).toContain(byId(r.decisions, "APP-007").status);
    expect(s.log).toHaveLength(2);
  });
});
