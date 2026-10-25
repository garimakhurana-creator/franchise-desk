// Diorama review: landing 3D India, city click, territory requests, request location. GPU when available.
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
    page.on("console", (m) => m.type() === "error" && !/tile|Failed to load resource|maps\.google/i.test(m.text()) && console.log(vp.tag, "console:", m.text().slice(0, 200)));
    page.on("pageerror", (e) => console.log(vp.tag, "pageerror:", e.message.slice(0, 200)));
    const shot = (n: string) => page.screenshot({ path: `${OUT}/diorama-${vp.tag}-${n}.png` });
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("body[data-ready]", { timeout: 60000 });
    await page.waitForSelector(".dio-tag", { timeout: 60000 });
    await page.waitForTimeout(4500);
    await shot("0-landing");
    await page.locator(".dio-tag", { hasText: "Mysuru" }).first().click({ force: true });
    await page.waitForTimeout(800);
    await shot("0b-city");
    await page.getByRole("button", { name: /launch with sample data/i }).first().click();
    await page.waitForSelector("[data-key]", { timeout: 60000 });
    await page.waitForTimeout(5000);
    await shot("1-overview");
    const tag = page.locator(".dio-tag", { hasText: "TER-02" }).first();
    if (!(await tag.count())) {
      console.log(vp.tag, "no TER-02 tag found");
      await ctx.close();
      continue;
    }
    await tag.click({ force: true });
    await page.waitForSelector("[data-testid=territory-requests]");
    await page.waitForTimeout(700);
    await shot("2-requests");
    await page.locator("[data-request]").first().click();
    await page.waitForSelector("[data-testid=coords]");
    console.log(vp.tag, "coords:", await page.locator("[data-testid=coords]").innerText());
    await page.waitForTimeout(7000);
    await shot("3-location");
    await page.getByRole("button", { name: /back to india/i }).click();
    await page.waitForTimeout(3000);
    await shot("4-back");
    await ctx.close();
  }
  await browser.close();
  console.log("done");
})();
