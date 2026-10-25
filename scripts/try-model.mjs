// Dev helper: call Gemini with the production prompt and print the raw JSON (never the key).
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.split("=")[0], l.split("=").slice(1).join("=").trim().replace(/^"|"$/g, "")]));
const { SYSTEM, RESPONSE_SCHEMA, buildPrompt } = await import("../lib/chat/model.ts");
const msg = process.argv[2];
const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
  body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: "user", parts: [{ text: buildPrompt(msg, ["APP-004", "APP-012"], ["TER-01"], []) }] }], generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA, temperature: 0 } }),
});
const j = await r.json();
console.log(r.status, j.candidates?.[0]?.content?.parts?.[0]?.text ?? JSON.stringify(j.error));
