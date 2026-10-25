// Design review screenshots: desktop and mobile, dark and light, several states -> docs/screens/.
// Usage: BASE_URL=http://localhost:3211 npx tsx scripts/shots.ts
import { chromium, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3211";
const OUT = "docs/screens";
mkdirSync(OUT, { recursive: true });

async function loadSample(page: Page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("body[data-ready]");
  await page.getByRole("button", { name: "Try sample data" }).click();
  await page.waitForSelector("[data-key]:visible");
}

(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  for (const scheme of ["dark", "light"] as const) {
    for (const vp of [{ w: 1440, h: 900, tag: "desktop" }, { w: 390, h: 844, tag: "mobile" }]) {
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, colorScheme: scheme, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      await page.goto(BASE, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("body[data-ready]");
      await page.screenshot({ path: `${OUT}/${vp.tag}-${scheme}-0-empty.png` });
      await loadSample(page);
      await page.waitForTimeout(6500); // map intro settles
      await page.screenshot({ path: `${OUT}/${vp.tag}-${scheme}-1-upload.png` });
      await page.locator('[data-key="APP-4"]:visible').first().click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/${vp.tag}-${scheme}-2-card.png` });
      await page.keyboard.press("Escape");
      await page.fill("#ask", "What if APP-004 moves to pin 570008?");
      await page.press("#ask", "Enter");
      await page.waitForSelector('[data-testid="desk-reply"]');
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/${vp.tag}-${scheme}-3-followup.png` });
      await ctx.close();
    }
  }
  await browser.close();
  console.log("screens written to", OUT);
})();
