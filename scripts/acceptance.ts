// Acceptance: a real browser uploads the golden and stress files, checks every status and the
// follow-up scripts, in three modes: model available, key removed (API 503), server unreachable.
// Usage: BASE_URL=http://localhost:3000 npx tsx scripts/acceptance.ts   (defaults to the live URL)
import { chromium, type Page } from "@playwright/test";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "https://franchise-desk-red.vercel.app";
const GOLDEN = path.resolve("tests/golden/golden.xlsx");
const STRESS = path.resolve("tests/golden/stress500.xlsx");

const EXPECTED: Record<string, string[]> = {
  "APP-1": ["APPROVED"], "APP-2": ["WAITLISTED"], "APP-3": ["APPROVED"], "APP-4": ["ON_HOLD"], "APP-5": ["ON_HOLD"],
  "APP-6": ["ON_HOLD"], "APP-7": ["ON_HOLD"], "APP-8": ["APPROVED"], "APP-9": ["APPROVED"], "APP-10": ["CONDITIONAL"],
  "APP-11": ["APPROVED"], "APP-12": ["WAITLISTED"], "APP-13": ["DECLINED"], "APP-14": ["DECLINED"], "APP-15": ["DECLINED"],
  "APP-16": ["WAITLISTED", "ON_HOLD", "DECLINED"], "APP-17": ["ON_HOLD"], "APP-18": ["APPROVED", "CONDITIONAL"],
  "APP-19": ["APPROVED", "CONDITIONAL"], "APP-20": ["WAITLISTED"], "APP-21": ["ON_HOLD"], "APP-22": ["ON_HOLD"],
};

type Script = { name: string; steps: string[]; expect: (RegExp | string)[]; status?: Record<string, string> };
const SCRIPTS: Script[] = [
  { name: "F1", steps: ["Why is APP-004 on hold?"], expect: ["ST-06", "570002", "570008"] },
  { name: "F2", steps: ["Why is APP-001 rejected?"], expect: [/not rejected; it is approved/] },
  { name: "F3", steps: ["Why is APP-099 on hold?"], expect: [/can't find APP-099/] },
  { name: "F4", steps: ["APP-007 owned space is 480 sq ft on the ground floor."], expect: [/On hold → Approved/, /APP-010: Conditional → Waitlisted/], status: { "APP-7": "APPROVED", "APP-10": "WAITLISTED", "APP-8": "APPROVED", "APP-9": "APPROVED" } },
  { name: "F5", steps: ["What if APP-004 moves to pin 570008?", "apply", "Confirm swap"], expect: [/swap confirmed/i], status: { "APP-4": "APPROVED", "APP-3": "WAITLISTED", "APP-1": "APPROVED" } },
  { name: "F6", steps: ["APP-001 has withdrawn."], expect: [/APP-002: Waitlisted → Approved/], status: { "APP-1": "WITHDRAWN", "APP-2": "APPROVED" } },
  { name: "F6-undo", steps: ["APP-001 has withdrawn.", "undo that"], expect: [/Undone/], status: { "APP-1": "APPROVED", "APP-2": "WAITLISTED" } },
  { name: "F7", steps: ["TER-03 now has 3 open slots."], expect: [/usable capacity is 1/, /No decision changes/], status: { "APP-12": "WAITLISTED" } },
  { name: "F8", steps: ["How many applications are on hold, and which?"], expect: [/7 applications are on hold: APP-004, APP-005, APP-006, APP-007, APP-017, APP-021, APP-022/] },
  { name: "F9", steps: ["APP-007 found a ground floor space of 480 sq ft; APP-010 withdrew."], expect: ["APP-007", "APP-010"], status: { "APP-7": "APPROVED", "APP-10": "WITHDRAWN" } },
  { name: "F13", steps: ["Who is next in line for TER-03?"], expect: [/#1 APP-012/] },
  { name: "F14", steps: ["Why did APP-001 beat APP-002?"], expect: [/APP-001 ranks ahead/, /share pin 570001/] },
  { name: "F15", steps: ["Which territories have unfilled slots?"], expect: [/usable capacity is allocated/, /TER-05 wants 1 store but no pin is free/, /TER-03 wants 2 stores but only 1 pin is free/] },
  { name: "F16", steps: ["What is the status of TER-02?"], expect: [/usable capacity 3/, /Approved: APP-008, APP-009/] },
];

async function upload(page: Page, file: string) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("body[data-ready]", { timeout: 30000 });
  await page.setInputFiles("#file", file);
  await page.waitForSelector("tr[data-key]", { timeout: 20000 });
}

async function statuses(page: Page): Promise<Record<string, string>> {
  return page.$$eval("tr[data-key]", (rows) => Object.fromEntries(rows.map((r) => [r.getAttribute("data-key")!, r.getAttribute("data-status")!])));
}

async function ask(page: Page, text: string) {
  const before = await page.locator('[data-testid="desk-reply"]').count();
  await page.fill("#ask", text);
  await page.press("#ask", "Enter");
  await page.waitForFunction((n) => document.querySelectorAll('[data-testid="desk-reply"]').length > n, before, { timeout: 15000 });
}

async function runMode(mode: "live" | "no-key" | "no-server") {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (mode === "no-key") await ctx.route("**/api/**", (r) => r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: true, ai: false }) }));
  if (mode === "no-server") await ctx.route("**/api/**", (r) => r.abort("connectionrefused"));
  const page = await ctx.newPage();
  const fails: string[] = [];
  try {
    await upload(page, GOLDEN);
    const st = await statuses(page);
    for (const [k, ok] of Object.entries(EXPECTED)) if (!ok.includes(st[k])) fails.push(`golden ${k}: got ${st[k]}, want ${ok.join("|")}`);
    if (Object.keys(st).length !== 22) fails.push(`golden rows: ${Object.keys(st).length}`);
    const badge = await page.textContent("body");
    if (!/Pin rule verified/.test(badge ?? "")) fails.push("pin-rule badge missing");

    for (const s of SCRIPTS) {
      await upload(page, GOLDEN);
      for (const step of s.steps) await ask(page, step);
      const text = (await page.locator('[data-testid="desk-reply"]').allInnerTexts()).join("\n");
      for (const e of s.expect) if (!(typeof e === "string" ? text.includes(e) : e.test(text))) fails.push(`${s.name}: missing ${e}`);
      if (s.status) {
        const now = await statuses(page);
        for (const [k, v] of Object.entries(s.status)) if (now[k] !== v) fails.push(`${s.name}: ${k} is ${now[k]}, want ${v}`);
      }
    }

    const t0 = Date.now();
    await upload(page, STRESS);
    const ms = Date.now() - t0;
    const n = Object.keys(await statuses(page)).length;
    if (n < 500) fails.push(`stress rows ${n}`);
    console.log(`  stress500: ${n} rows rendered in ${ms} ms (including page load)`);
    if (ms > 8000) fails.push(`stress too slow: ${ms} ms`);
  } catch (e) {
    fails.push(`crash: ${(e as Error).message.split("\n")[0]}`);
  } finally {
    await browser.close();
  }
  return fails;
}

(async () => {
  console.log(`Acceptance against ${BASE}`);
  let total = 0;
  for (const mode of ["live", "no-key", "no-server"] as const) {
    const fails = await runMode(mode);
    total += fails.length;
    console.log(`${fails.length ? "FAIL" : "PASS"} ${mode}${fails.length ? "\n  - " + fails.join("\n  - ") : ""}`);
  }
  process.exit(total ? 1 : 0);
})();
