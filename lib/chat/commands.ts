// The command language shared by the rule-based parser and the model adapter.
// A model may only produce these commands; the engine still makes every decision.
import { z } from "zod";

const Status = z.enum(["APPROVED", "CONDITIONAL", "ON_HOLD", "WAITLISTED", "DECLINED", "WITHDRAWN"]);
const Facts = z
  .object({
    pin: z.string().regex(/^[1-9]\d{5}$/).optional(),
    city: z.string().max(40).optional(),
    invest: z.number().positive().max(100000).optional(),
    experience: z.number().min(0).max(80).optional(),
    space: z.enum(["Owned", "Rented", "None"]).optional(),
    size: z.number().positive().max(100000).nullable().optional(),
    floor: z.enum(["Ground", "Upper", "Mall", "Unknown"]).nullable().optional(),
    targetMonths: z.number().min(0).max(120).optional(),
    language: z.enum(["Kannada", "English", "Hindi"]).optional(),
  })
  .strict();

export const POLICY_PATHS = {
  "bars.approval": "approval bar",
  "bars.decline": "decline bar",
  "capex.declineBelowPct": "funding floor (% of estimate)",
  "spacing.km": "minimum spacing between new stores (km)",
  "capex.bufferPct": "working-capital buffer (%)",
} as const;

export const CommandSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("explain"), ids: z.array(z.string()).min(1).max(6), premise: Status.optional() }),
  z.object({ intent: z.literal("next_steps"), ids: z.array(z.string()).min(1).max(6) }),
  z.object({ intent: z.literal("what_would_it_take"), ids: z.array(z.string()).min(1).max(6) }),
  z.object({ intent: z.literal("compare"), ids: z.array(z.string()).length(2) }),
  z.object({ intent: z.literal("rank_explain"), ids: z.array(z.string()).length(2) }),
  z.object({ intent: z.literal("territory_status"), territories: z.array(z.string()).max(10), filter: z.enum(["unfilled"]).optional() }),
  z.object({ intent: z.literal("queue"), territories: z.array(z.string()).max(10).optional(), ids: z.array(z.string()).max(6).optional() }),
  z.object({ intent: z.literal("update_facts"), id: z.string(), changes: Facts, missing: z.array(z.string()).max(6).optional(), hypothetical: z.boolean().optional(), summary: z.string().max(200).optional() }),
  z.object({ intent: z.literal("withdraw"), id: z.string(), hypothetical: z.boolean().optional() }),
  z.object({ intent: z.literal("territory_change"), territory: z.string(), slots: z.number().int().min(0).max(50).optional(), addPins: z.array(z.string().regex(/^[1-9]\d{5}$/)).max(20).optional(), removePins: z.array(z.string().regex(/^[1-9]\d{5}$/)).max(20).optional(), priority: z.enum(["High", "Medium", "Low"]).optional(), hypothetical: z.boolean().optional() }),
  z.object({ intent: z.literal("policy_change"), path: z.enum(Object.keys(POLICY_PATHS) as [keyof typeof POLICY_PATHS, ...(keyof typeof POLICY_PATHS)[]]), value: z.number().min(0).max(1000), hypothetical: z.boolean() }),
  z.object({ intent: z.literal("apply") }),
  z.object({ intent: z.literal("undo") }),
  z.object({ intent: z.literal("reset") }),
  z.object({ intent: z.literal("confirm_swap"), ids: z.array(z.string()).max(2).optional() }),
  z.object({ intent: z.literal("verify"), id: z.string() }),
  z.object({ intent: z.literal("simulate_days"), days: z.number().int().min(1).max(90) }),
  z.object({ intent: z.literal("list"), status: z.array(Status).max(6).optional(), onlyCode: z.string().max(40).optional() }),
  z.object({ intent: z.literal("summary") }),
  z.object({ intent: z.literal("help"), reason: z.string().max(200).optional() }),
]);

export type Command = z.infer<typeof CommandSchema>;
export const ParsedSchema = z.object({ commands: z.array(CommandSchema).max(8), language: z.enum(["English", "Hindi", "Kannada", "Hinglish"]).optional() });
export type Parsed = z.infer<typeof ParsedSchema>;
