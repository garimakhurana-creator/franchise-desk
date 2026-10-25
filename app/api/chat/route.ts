// Model route: turns a follow-up into commands. Rate-limited, budget-capped, cached, 6 s timeout.
// It returns commands only; the browser's engine makes every decision. No personal data is logged.
import { complete, llmConfigured } from "@/lib/llm";
import { buildPrompt, normaliseModelOutput, RESPONSE_SCHEMA, SYSTEM } from "@/lib/chat/model";

export const dynamic = "force-dynamic";

const MAX_INFLIGHT = 3;
const PER_IP_PER_MIN = 12;
const DAILY_BUDGET = Number(process.env.LLM_DAILY_BUDGET ?? 400);
let inflight = 0;
let day = "";
let used = 0;
const hits = new Map<string, number[]>();
const cache = new Map<string, unknown>();

function limited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > PER_IP_PER_MIN;
}

export async function POST(req: Request) {
  if (!llmConfigured()) return Response.json({ parsed: null, reason: "not configured" }, { status: 503 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return Response.json({ parsed: null, reason: "rate limited" }, { status: 429 });
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    used = 0;
  }
  if (used >= DAILY_BUDGET) return Response.json({ parsed: null, reason: "daily budget reached" }, { status: 429 });

  let body: { message?: unknown; ids?: unknown; territories?: unknown; lastIds?: unknown; stateHash?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ parsed: null, reason: "bad request" }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.slice(0, 600) : "";
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 20)).slice(0, 600) : [];
  const territories = Array.isArray(body.territories) ? body.territories.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 20)).slice(0, 100) : [];
  const recent = Array.isArray(body.lastIds) ? body.lastIds.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 20)).slice(0, 6) : [];
  if (!message.trim()) return Response.json({ parsed: null, reason: "empty" }, { status: 400 });

  const key = `${String(body.stateHash ?? "").slice(0, 60)}|${recent.join(",")}|${message.toLowerCase().replace(/\s+/g, " ").trim()}`;
  if (cache.has(key)) return Response.json({ parsed: cache.get(key), cached: true });
  if (inflight >= MAX_INFLIGHT) return Response.json({ parsed: null, reason: "busy" }, { status: 429 });

  inflight++;
  used++;
  try {
    // Only the message and IDs are sent: never applicant names or notes.
    const raw = await complete(buildPrompt(message, ids, territories, recent), RESPONSE_SCHEMA, SYSTEM);
    const parsed = normaliseModelOutput(raw, message, recent);
    if (cache.size > 500) cache.clear();
    cache.set(key, parsed);
    return Response.json({ parsed });
  } catch {
    return Response.json({ parsed: null, reason: "model unavailable" }, { status: 502 });
  } finally {
    inflight--;
  }
}
