// Explore review: India overview, fly into a territory, open a request, step to the next. GPU when available.
// Usage: BASE_URL=http://localhost:3210 npx tsx scripts/explore-shots.ts
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3210";
mkdirSync("docs/screens", { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
  for (const vp of [{ w: 1600, h: 900, t: "desktop" }, { w: 390, h: 844, t: "mobile" }]) {
    const p = await b.newPage({ viewport: { width: vp.w, height: vp.h } });
    p.on("pageerror", (e) => console.log(vp.t, "pageerror:", e.message.slice(0, 200)));
    p.on("console", (m) => m.type() === "error" && !/Failed to load resource|maps\.google|tile/i.test(m.text()) && console.log(vp.t, "console:", m.text().slice(0, 200)));
    const shot = (n: string) => p.screenshot({ path: `docs/screens/explore-${vp.t}-${n}.png` });
    await p.goto(BASE, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(".dio-tag[data-key] .dp-num:not(:empty)", { timeout: 60000 });
    await p.waitForTimeout(4500);
    await shot("0-first-page");
    await p.getByRole("button", { name: /try sample data/i }).click();
    await p.getByRole("tab", { name: "Explore" }).waitFor({ timeout: 60000 });
    await p.waitForSelector(".dio-tag[data-key='" + "" + "']", { state: "detached" }).catch(() => {});
    await p.locator(".dio-tag", { hasText: "TER-01" }).first().waitFor({ timeout: 60000 });
    await p.waitForTimeout(3000);
    await shot("1-india");
    await p.locator(".dio-tag", { hasText: "TER-01" }).first().evaluate((el) => (el as HTMLElement).click());
    await p.waitForSelector("[data-testid=territory-requests]");
    await p.waitForFunction(() => !document.body.innerText.includes("Flying into"), null, { timeout: 60000 });
    await p.waitForTimeout(3500);
    await shot("2-territory");
    await p.locator("[data-request]").first().click();
    await p.waitForSelector("[data-testid=verdict]");
    console.log(vp.t, "coords:", (await p.locator("[data-testid=coords]").innerText()).replace(/\n/g, " "));
    await p.waitForTimeout(3500);
    await shot("3-request");
    await p.getByRole("button", { name: /next request/i }).click();
    await p.waitForTimeout(3000);
    await shot("4-next");
    await p.close();
  }
  await b.close();
  console.log("done");
})();
