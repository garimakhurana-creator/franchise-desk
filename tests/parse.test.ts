import { describe, expect, it } from "vitest";
import { loadXlsx } from "./helpers";
import { parseWorkbook, ParseError } from "@/lib/parse/parse";
import { parseLakh, parsePin, normaliseId, parseSize, parseTarget } from "@/lib/engine/normalise";

describe("parser smoke", () => {
  it("reads golden.xlsx and drops both grey example rows", () => {
    const ds = loadXlsx("golden/golden.xlsx");
    expect(ds.applications).toHaveLength(22);
    expect(ds.territories).toHaveLength(6);
    expect(ds.stores).toHaveLength(10);
    const a1 = ds.applications.find((a) => a.key === "APP-1")!;
    expect(a1.name).toBe("Meera Nair");
    expect(ds.rowsIgnored.some((r) => r.sheet === "Applications" && r.row === 3)).toBe(true);
    expect(ds.rowsIgnored.some((r) => r.sheet === "Territories" && r.row === 3)).toBe(true);
    const a2 = ds.applications.find((a) => a.key === "APP-2")!;
    expect(a2.name).toBe("Suresh Gowda");
    expect(a2.city).toBe("Mysuru");
    expect(a2.pin).toBe("570001");
  });

  it("keeps the template example row when no other APP-001 exists", () => {
    const ds = loadXlsx("../docs/Case1_Franchise_Test_Data_Format.xlsx", "upload");
    expect(ds.applications.map((a) => a.id)).toEqual(["APP-001"]);
    expect(ds.territories.map((t) => t.id)).toEqual(["TER-01"]);
  });

  it("reads the 500-row stress file quickly", () => {
    const t0 = performance.now();
    const ds = loadXlsx("golden/stress500.xlsx");
    // 500 generated rows plus the template example row, kept because no other APP-001 exists
    expect(ds.applications).toHaveLength(501);
    expect(performance.now() - t0).toBeLessThan(3000);
  });

  it("gives a friendly error when a sheet is missing", () => {
    expect(() => parseWorkbook([{ name: "Sheet1", rows: [["hello"]] }])).toThrow(ParseError);
    expect(() => parseWorkbook([{ name: "Sheet1", rows: [["hello"]] }])).toThrow(/Applications/);
  });
});

describe("coercions", () => {
  it.each([
    ["25", 25],
    ["25 lakh", 25],
    ["₹25L", 25],
    ["₹25,00,000", 25],
    ["1.2 crore", 120],
    ["20-25 lakh", 20],
    [25.0, 25],
  ])("parseLakh(%s) = %s", (raw, v) => expect(parseLakh(raw).value).toBe(v));

  it("flags ranges", () => expect(parseLakh("20-25 lakh").kind).toBe("range"));
  it("pins", () => {
    expect(parsePin(570001.0).pin).toBe("570001");
    expect(parsePin("570001 ").pin).toBe("570001");
    expect(parsePin("57001").problem).toBe("invalid");
    expect(parsePin("").problem).toBe("missing");
  });
  it("ids", () => {
    expect(normaliseId("APP-007")).toBe("APP-7");
    expect(normaliseId("app 7")).toBe("APP-7");
    expect(normaliseId("APP-1000")).toBe("APP-1000");
  });
  it("sizes and targets", () => {
    expect(parseSize("40 sq m").value).toBe(431);
    expect(parseSize("450 sq ft").value).toBe(450);
    expect(parseTarget("ASAP").value).toBe(1);
    expect(parseTarget("flexible").value).toBeNull();
  });
});
