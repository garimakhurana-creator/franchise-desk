// Provider-agnostic model adapter. Server-side only: the key never reaches the browser.
// complete(prompt, jsonSchema) returns parsed JSON or throws. Swap the provider here.
import "server-only";

const TIMEOUT_MS = 6000;
let discovered: string | null = null;

export class LlmError extends Error {}

export function llmConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

async function pickModel(key: string): Promise<string> {
  if (process.env.GEMINI_MODEL) return process.env.GEMINI_MODEL;
  if (discovered) return discovered;
  // Not hardcoded: list the models available to this key and take a current Flash model.
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(3000) });
    const j = (await r.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
    const names = (j.models ?? []).filter((m) => m.supportedGenerationMethods?.includes("generateContent")).map((m) => m.name.replace(/^models\//, ""));
    discovered = names.find((n) => n === "gemini-flash-latest") ?? names.find((n) => /flash$/.test(n) && !/lite|image|tts|preview/.test(n)) ?? "gemini-flash-latest";
  } catch {
    discovered = "gemini-flash-latest";
  }
  return discovered;
}

export async function complete(prompt: string, jsonSchema: object, system?: string): Promise<unknown> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new LlmError("no key");
  const model = await pickModel(key);
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: jsonSchema, temperature: 0 },
    }),
  });
  if (!res.ok) throw new LlmError(`model http ${res.status}`);
  const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  try {
    return JSON.parse(text);
  } catch {
    throw new LlmError("model returned non-JSON");
  }
}
