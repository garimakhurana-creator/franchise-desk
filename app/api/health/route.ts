import { llmConfigured } from "@/lib/llm";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true, ai: llmConfigured(), time: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
}
