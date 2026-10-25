// Post-check for translated answers: the model may reword, never change a fact.
// Every number and ID in the English answer must appear in the translation, and nothing new.

const TOKEN = /[A-Z]{2,4}-\d{1,5}|\d+(?:[.,]\d+)*/g;

export function factTokens(text: string): string[] {
  return (text.match(TOKEN) ?? []).map((t) => t.replace(/,/g, "")).sort();
}

/** True when the translation carries exactly the same numbers and IDs as the source. */
export function sameFacts(source: string, translated: string): boolean {
  const a = factTokens(source);
  const b = factTokens(translated);
  return a.length === b.length && a.every((t, i) => t === b[i]);
}

export const TRANSLATE_SCHEMA = {
  type: "OBJECT",
  properties: { lines: { type: "ARRAY", items: { type: "STRING" } } },
  required: ["lines"],
} as const;

export function translatePrompt(lines: string[], lang: "Hindi" | "Kannada"): string {
  return JSON.stringify({
    task: `Translate each line into simple ${lang} (${lang === "Hindi" ? "Devanagari" : "Kannada"} script). Keep every number, ₹ amount, pin code and ID such as APP-007 or TER-02 exactly as written, in Western digits. Do not add, remove or change any fact. Return the same number of lines.`,
    lines,
  });
}
