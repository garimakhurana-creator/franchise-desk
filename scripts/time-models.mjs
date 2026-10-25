import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.split("=")[0], l.split("=").slice(1).join("=").trim().replace(/^"|"$/g, "")]));
const { SYSTEM, RESPONSE_SCHEMA, buildPrompt, normaliseModelOutput } = await import("../lib/chat/model.ts");
const msg = "APP-012 ಗೆ ನೆಲ ಮಹಡಿಯಲ್ಲಿ 400 ಚದರ ಅಡಿ ಜಾಗ ಸಿಕ್ಕಿದೆ";
for (const model of ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.5-flash-lite", "gemini-flash-lite-latest"]) {
  const t = Date.now();
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY }, body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: "user", parts: [{ text: buildPrompt(msg, Array.from({ length: 22 }, (_, i) => `APP-${String(i + 1).padStart(3, "0")}`), ["TER-01"], []) }] }], generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA, temperature: 0 } }) });
  const j = await r.json();
  const txt = j.candidates?.[0]?.content?.parts?.[0]?.text;
  let out = null; try { out = normaliseModelOutput(JSON.parse(txt), msg, []); } catch {}
  console.log(model, r.status, Date.now() - t, "ms", JSON.stringify(out)?.slice(0, 120) ?? j.error?.message);
}
