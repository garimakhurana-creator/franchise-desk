// No-WebGL check: with 3D switched off in the browser the first page and the dashboard still show India and its pins.
// Usage: BASE_URL=http://localhost:3210 npx tsx scripts/nogl-test.ts
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3210";
mkdirSync("docs/screens", { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(BASE, { waitUntil: "domcontentloaded" });
  await p.waitForSelector("body[data-ready]", { timeout: 60000 });
  const gl = await p.evaluate(() => !!document.createElement("canvas").getContext("webgl"));
  console.log("webgl available:", gl);
  await p.waitForSelector(".dio-tag", { timeout: 30000 });
  await p.waitForTimeout(2000);
  await p.screenshot({ path: "docs/screens/nogl-0-first-page.png" });
  console.log("first page pins:", await p.locator(".dio-tag").count());
  await p.getByRole("button", { name: /try sample data/i }).click();
  await p.getByRole("tab", { name: "Explore" }).waitFor({ timeout: 60000 });
  await p.locator(".dio-tag", { hasText: "TER-02" }).first().waitFor({ timeout: 30000 });
  await p.locator(".dio-tag", { hasText: "TER-02" }).first().click();
  await p.waitForSelector("[data-request]");
  await p.locator("[data-request]").first().click();
  await p.waitForSelector("[data-testid=verdict]");
  await p.waitForTimeout(3000);
  await p.screenshot({ path: "docs/screens/nogl-1-request.png" });
  console.log("coords:", await p.locator("[data-testid=coords]").innerText());
  await b.close();
})();
