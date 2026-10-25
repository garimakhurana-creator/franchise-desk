// Translates a finished answer into Hindi or Kannada. Post-checked: if any number or ID differs,
// the translation is discarded and the English answer stands.
import { complete, llmConfigured } from "@/lib/llm";
import { sameFacts, translatePrompt, TRANSLATE_SCHEMA } from "@/lib/chat/translate";

export const dynamic = "force-dynamic";

const hits = new Map<string, number[]>();
const cache = new Map<string, string[] | null>();

export async function POST(req: Request) {
  if (!llmConfigured()) return Response.json({ lines: null, reason: "not configured" }, { status: 503 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (recent.length > 10) return Response.json({ lines: null, reason: "rate limited" }, { status: 429 });
  let body: { lines?: unknown; lang?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ lines: null }, { status: 400 });
  }
  const lang = body.lang === "Hindi" || body.lang === "Kannada" ? body.lang : null;
  const lines = Array.isArray(body.lines) ? body.lines.filter((x): x is string => typeof x === "string").slice(0, 30).map((x) => x.slice(0, 400)) : [];
  if (!lang || !lines.length) return Response.json({ lines: null }, { status: 400 });
  const key = `${lang}|${lines.join("\n")}`;
  if (cache.has(key)) return Response.json({ lines: cache.get(key) });
  try {
    const out = (await complete(translatePrompt(lines, lang), TRANSLATE_SCHEMA)) as { lines?: unknown };
    const tr = Array.isArray(out.lines) ? out.lines.filter((x): x is string => typeof x === "string") : [];
    const ok = tr.length === lines.length && tr.every((t, i) => sameFacts(lines[i], t));
    const result = ok ? tr : null;
    if (cache.size > 300) cache.clear();
    cache.set(key, result);
    return Response.json({ lines: result, reason: ok ? undefined : "post-check failed" });
  } catch {
    return Response.json({ lines: null, reason: "model unavailable" }, { status: 502 });
  }
}
