// The model path is tested with mocked outputs only; no test calls the real API.
import { describe, expect, it } from "vitest";
import { normaliseModelOutput } from "@/lib/chat/model";

describe("model output normalisation (mocked adapter)", () => {
  it("fixes shape slips and grounds facts in the message", () => {
    const msg = "APP-012 को अब ग्राउंड फ्लोर की 400 वर्ग फुट जगह मिल गई है";
    const out = normaliseModelOutput({ commands: [{ intent: "update_facts", ids: ["APP-012"], size: 400, targetMonths: 0, invest: 50 }] }, msg, []);
    expect(out?.commands[0]).toMatchObject({ intent: "update_facts", id: "APP-12", changes: { size: 400, floor: "Ground" } });
    expect((out?.commands[0] as { changes: Record<string, unknown> }).changes.invest).toBeUndefined();
  });

  it("rejects IDs the user never mentioned", () => {
    expect(normaliseModelOutput({ commands: [{ intent: "explain", ids: ["APP-77"] }] }, "why is APP-4 on hold", [])).toBeNull();
  });

  it("accepts IDs from recent context for pronouns", () => {
    const out = normaliseModelOutput({ commands: [{ intent: "next_steps", id: "APP-4" }] }, "uske next steps kya hain?", ["APP-4"]);
    expect(out?.commands[0]).toMatchObject({ intent: "next_steps", ids: ["APP-4"] });
  });

  it("drops invented facts: a pin change does not imply losing the space", () => {
    const out = normaliseModelOutput({ commands: [{ intent: "update_facts", id: "APP-4", pin: "570008", space: "None", size: null, hypothetical: true }] }, "app 4 ka pin 570008 ho gaya toh kya hoga", []);
    expect(out?.commands[0]).toMatchObject({ changes: { pin: "570008" }, hypothetical: true });
    expect((out?.commands[0] as { changes: Record<string, unknown> }).changes.space).toBeUndefined();
  });

  it("garbage output yields null so the rule path takes over", () => {
    expect(normaliseModelOutput({ nonsense: true }, "hi", [])).toBeNull();
    expect(normaliseModelOutput({ commands: [{ intent: "approve_everyone" }] }, "hi", [])).toBeNull();
  });
});

import { sameFacts } from "@/lib/chat/translate";
describe("translation post-check", () => {
  it("accepts a translation with the same numbers and IDs", () => {
    expect(sameFacts("APP-004: pin 570009 has store ST-06; score 96.", "APP-004: पिन 570009 पर स्टोर ST-06 है; स्कोर 96।")).toBe(true);
  });
  it("rejects a changed, dropped or added fact", () => {
    expect(sameFacts("score 96 vs 84", "स्कोर 96 बनाम 85")).toBe(false);
    expect(sameFacts("APP-004 and APP-003", "APP-004")).toBe(false);
    expect(sameFacts("score 96", "स्कोर 96, 100 में से")).toBe(false);
  });
});
