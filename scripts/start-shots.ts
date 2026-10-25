// Start screen at common sizes: is the sample-data button visible without scrolling?
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "https://franchise-desk-red.vercel.app";
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[1366, 768], [1280, 720], [1536, 864], [1440, 900], [390, 844], [768, 1024]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage();
    await p.goto(BASE, { waitUntil: "networkidle" });
    const btn = p.getByRole("button", { name: /sample data/i });
    const n = await btn.count();
    const box = n ? await btn.first().boundingBox() : null;
    const vis = n ? await btn.first().isVisible() : false;
    const style = n ? await btn.first().evaluate((el) => { const s = getComputedStyle(el); return `${s.backgroundColor} ${s.color} op=${s.opacity}`; }) : "";
    console.log(`${w}x${h}: count=${n} visible=${vis} box=${box ? `${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)}` : "none"} inViewport=${box ? box.y + box.height <= h : false} style=${style}`);
    await p.screenshot({ path: `${process.env.OUT ?? "."}/start-${w}x${h}.png` });
    await ctx.close();
  }
  await b.close();
})();
