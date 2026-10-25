import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.split("=")[0], l.split("=").slice(1).join("=").trim().replace(/^"|"$/g, "")]));
const { SYSTEM, RESPONSE_SCHEMA, buildPrompt, normaliseModelOutput } = await import("../lib/chat/model.ts");
for (const msg of process.argv.slice(2)) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY }, body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: "user", parts: [{ text: buildPrompt(msg, (process.env.IDS ?? "APP-012").split(","), [], []) }] }], generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA, temperature: 0 } }) });
  const j = await r.json();
  const raw = JSON.parse(j.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}");
  console.log(msg, "\n  =>", JSON.stringify(normaliseModelOutput(raw, msg, [])));
}
