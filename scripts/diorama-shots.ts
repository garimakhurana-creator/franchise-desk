// Diorama review: overview, deep dive into a territory, back to India. GPU when available.
// Usage: BASE_URL=http://localhost:3210 npx tsx scripts/diorama-shots.ts
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3210";
const OUT = "docs/screens";
mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
  for (const vp of [{ w: 1440, h: 900, tag: "desktop" }, { w: 390, h: 844, tag: "mobile" }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, colorScheme: "dark" });
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && !/tile|Failed to load resource/i.test(m.text()) && console.log(vp.tag, "console:", m.text().slice(0, 200)));
    page.on("pageerror", (e) => console.log(vp.tag, "pageerror:", e.message.slice(0, 200)));
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("body[data-ready]", { timeout: 60000 });
    await page.getByRole("button", { name: /sample data/i }).click();
    await page.waitForSelector("[data-key]:visible", { timeout: 60000 });
    await page.waitForTimeout(6000);
    await page.screenshot({ path: `${OUT}/diorama-${vp.tag}-1-overview.png` });
    const tag = page.locator(".dio-tag", { hasText: "TER-02" }).first();
    if (await tag.count()) {
      await tag.click({ force: true });
      await page.waitForTimeout(6500);
      await page.screenshot({ path: `${OUT}/diorama-${vp.tag}-2-deepdive.png` });
      await page.getByRole("button", { name: /back to india/i }).click();
      await page.waitForTimeout(4500);
      await page.screenshot({ path: `${OUT}/diorama-${vp.tag}-3-back.png` });
    } else console.log(vp.tag, "no TER-02 tag found");
    await ctx.close();
  }
  await browser.close();
  console.log("done");
})();
