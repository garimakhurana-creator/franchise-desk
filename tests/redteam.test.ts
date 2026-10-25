// Red-team regression tests: adversarial rows not copied from GOLDEN.md (tests/redteam/redteam-data.json).
import { describe, expect, it } from "vitest";
import { run, DEFAULT_POLICY, type Decision } from "@/lib/engine";
import { lintAll } from "@/lib/engine/lint";
import { loadXlsx, TODAY } from "./helpers";

const ds = loadXlsx("redteam/redteam.xlsx", "upload");
const r = run(ds, DEFAULT_POLICY, { today: TODAY, pinned: {} });
const D = (id: string): Decision => r.decisions.find((d) => d.id === id)!;

describe("red team", () => {
  it("every explanation passes the style lint", () => expect(lintAll(r.decisions).slice(0, 8)).toEqual([]));
  it("pin rule and capacity hold", () => {
    expect(r.pinConflicts).toBe(0);
    for (const t of r.territories) expect(t.approved.length + t.conditional.length).toBeLessThanOrEqual(t.effectiveCapacity);
  });
  it("odd formats are read, not crashed on", () => {
    expect(D("RT-01").pin).toBe("560034"); // "560 034 "
    expect(ds.applications.find((a) => a.id === "RT-02")!.invest).toBe(45); // ₹45,00,000
    expect(ds.applications.find((a) => a.id === "RT-03")!.invest).toBe(20); // 20-25 lakh -> lower bound
    expect(ds.applications.find((a) => a.id === "RT-04")!.invest).toBe(120); // 1.2 crore
    expect(ds.applications.find((a) => a.id === "RT-09")!.size).toBe(484); // 45 sq m
    expect(ds.applications.find((a) => a.id === "RT-10")!.floor).toBe("Upper"); // 1st floor
    expect(ds.applications.find((a) => a.id === "RT-40")!.invest).toBe(25); // ₹25L
  });
  it("unreadable or negative values hold with a precise ask", () => {
    expect(D("RT-05").status).toBe("ON_HOLD");
    expect(D("RT-05").why).toMatch(/"fifty lakh" cannot be read/);
    expect(D("RT-06").why).toMatch(/negative/);
    expect(D("RT-07").why).toMatch(/60 years/);
    expect(D("RT-22").codes[0]).toBe("PIN_INVALID");
    expect(D("RT-23").codes[0]).toBe("PIN_MISSING");
  });
  it("contradictions name both facts", () => {
    expect(D("RT-08").why).toMatch(/0 years, but the business text says/);
    expect(D("RT-21").why).toMatch(/form says Mysore, but pin 560008 is Bengaluru/);
    expect(D("RT-37").why).toMatch(/"Not yet identified" yet the note says/);
    expect(D("RT-28").codes).toContain("SPACE_CONTRADICTION");
  });
  it("injection in any language is flagged and ignored", () => {
    for (const id of ["RT-17", "RT-18"]) expect(D(id).codes).toContain("INJECTION");
    const clean = run({ ...ds, applications: ds.applications.map((a) => (a.id === "RT-18" ? { ...a, notes: "" } : a)) }, DEFAULT_POLICY, { today: TODAY, pinned: {} });
    expect(clean.decisions.find((d) => d.id === "RT-18")!.score!.total).toBe(D("RT-18").score!.total);
  });
  it("integrity signals route to checks, never decline", () => {
    expect(D("RT-11").codes).toContain("WEAK_TITLE");
    expect(D("RT-12").codes).toContain("WEAK_TITLE");
    expect(D("RT-13").codes).toContain("CONFLICT_OF_INTEREST"); // read from the business column
    expect(D("RT-14").codes).toContain("COMPLIANCE_CUE");
    expect(D("RT-15").codes).toContain("COMPLIANCE_CUE");
    expect(D("RT-16").codes).toContain("LOAN_DEPENDENT"); // Kannada note
    expect(D("RT-04").codes).toContain("CAPACITY_OUTLIER");
    expect(D("RT-41").codes).toContain("CAPACITY_OUTLIER");
    expect(D("RT-25").codes).toContain("COMPLIANCE_CUE"); // mall unit in a Tier 3 town
    expect(D("RT-38").codes).toContain("PROVEN_OPERATOR");
    for (const d of r.decisions) if (d.status === "DECLINED") expect(["OUT_OF_TERRITORY", "PIN_HAS_STORE_NO_ALT", "INVEST_LOW", "BELOW_BAR"]).toContain(d.codes[0]);
  });
  it("an unreadable Kannada note is reported, not guessed", () => {
    expect(D("RT-19").flags.some((f) => /cannot interpret/.test(f.text))).toBe(true);
  });
  it("implausible or oversized spaces are handled sensibly", () => {
    expect(D("RT-27").status).toBe("ON_HOLD"); // 50,000 sq ft: confirm, do not decline on it
    expect(D("RT-26").status).not.toBe("DECLINED"); // 2,500 sq ft kirana costed on the format size
    expect(D("RT-26").capex!.sizeUsed).toBe(700);
  });
  it("duplicates: exact copy dropped, conflicting copy held", () => {
    expect(ds.rowsIgnored.some((x) => /exact duplicate/.test(x.reason))).toBe(true);
    expect(r.decisions.filter((d) => d.codes.includes("DUPLICATE_ID")).length).toBe(2);
  });
  it("territory sheet mess: typos, trailing comma, a pin in two territories, zero slots, all-store pins", () => {
    const t2 = ds.territories.find((t) => t.id === "TR-02")!;
    expect(t2.priority).toBe("High");
    expect(t2.tier).toBe(1);
    expect(ds.notes.some((n) => /560008 appears in TR-01 and TR-02/.test(n.message))).toBe(true);
    expect(ds.notes.some((n) => /56OO12/.test(n.message))).toBe(true);
    expect(r.territories.find((t) => t.id === "TR-03")!.effectiveCapacity).toBe(0);
    expect(D("RT-40").codes[0]).toBe("PIN_HAS_STORE_NO_ALT");
  });
  it("same-property needs the same tenure too", () => {
    const rented = run({ ...ds, applications: ds.applications.map((a) => (a.id === "RT-18" ? { ...a, space: "Owned" as const } : a)) }, DEFAULT_POLICY, { today: TODAY, pinned: {} });
    expect(rented.decisions.find((d) => d.id === "RT-02")!.codes).not.toContain("SAME_PROPERTY_CLAIM");
  });
});
