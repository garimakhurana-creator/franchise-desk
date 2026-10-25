// Terrain map review shots: India intro, Karnataka with callouts, a selected stone. GPU when available.
// Usage: BASE_URL=http://localhost:3210 npx tsx scripts/map-shots.ts
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3210";
const OUT = "docs/screens";
mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
  for (const scheme of (process.env.SCHEMES ?? "dark,light").split(",") as ("dark" | "light")[]) {
    for (const vp of [{ w: 1440, h: 900, tag: "desktop" }, { w: 390, h: 844, tag: "mobile" }]) {
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, colorScheme: scheme });
      const page = await ctx.newPage();
      page.on("console", (m) => m.type() === "error" && !/tile|Failed to load resource/i.test(m.text()) && console.log(vp.tag, scheme, "console:", m.text().slice(0, 160)));
      await page.goto(BASE, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("body[data-ready]", { timeout: 60000 });
      await page.getByRole("button", { name: "Try sample data" }).click();
      await page.waitForSelector("[data-key]:visible", { timeout: 60000 });
      await page.waitForTimeout(2900);
      await page.screenshot({ path: `${OUT}/terrain-${vp.tag}-${scheme}-1-india.png` });
      await page.waitForTimeout(8000);
      await page.screenshot({ path: `${OUT}/terrain-${vp.tag}-${scheme}-2-karnataka.png` });
      const failed = await page.locator("text=Map unavailable").count();
      if (failed) console.log(vp.tag, scheme, "MAP FAILED:", await page.locator("text=Map unavailable").first().innerText());
      const callout = page.locator(".tm-callout").first();
      if (await callout.count()) {
        await callout.click({ force: true });
        await page.waitForTimeout(3000);
        await page.screenshot({ path: `${OUT}/terrain-${vp.tag}-${scheme}-3-territory.png` });
      }
      await ctx.close();
    }
  }
  await browser.close();
  console.log("done");
})();
