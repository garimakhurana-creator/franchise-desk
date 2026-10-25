// Upload check from the map-only first page: real workbooks open the desk, a wrong file shows a clear error.
// Usage: BASE_URL=http://localhost:3210 npx tsx scripts/upload-test.ts
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3210";
const OUT = "docs/screens";
mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
  let failed = 0;
  const check = (ok: boolean, what: string) => {
    console.log(`${ok ? "PASS" : "FAIL"} ${what}`);
    if (!ok) failed++;
  };
  for (const vp of [{ w: 1440, h: 900, tag: "desktop" }, { w: 390, h: 844, tag: "mobile" }]) {
    const page = await (await browser.newContext({ viewport: { width: vp.w, height: vp.h }, colorScheme: "dark" })).newPage();
    page.on("pageerror", (e) => console.log(vp.tag, "pageerror:", e.message.slice(0, 200)));
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("body[data-ready]", { timeout: 60000 });
    await page.waitForSelector(".dio-tag[data-key]", { timeout: 60000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${OUT}/upload-${vp.tag}-0-first-page.png` });
    const upload = page.locator("label[for=file]");
    check(await upload.isVisible(), `${vp.tag}: Upload button visible on the first page`);

    // wrong file type
    const bad = path.resolve("docs/screens/not-a-workbook.txt");
    writeFileSync(bad, "hello");
    await page.setInputFiles("#file", bad);
    const alert = page.locator("p[role=alert]");
    await alert.waitFor({ timeout: 10000 });
    check(/not an Excel file/i.test(await alert.innerText()), `${vp.tag}: wrong file type explained`);
    await page.screenshot({ path: `${OUT}/upload-${vp.tag}-1-bad-file.png` });

    // the golden workbook
    await page.setInputFiles("#file", path.resolve("tests/golden/golden.xlsx"));
    await page.getByRole("tab", { name: "Summary" }).click({ timeout: 60000 });
    await page.waitForSelector("[data-key][data-status]", { timeout: 60000 });
    const rows = await page.locator("[data-key][data-status]").count();
    check(rows === 22, `${vp.tag}: golden.xlsx opened with ${rows} applications (want 22)`);
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${OUT}/upload-${vp.tag}-2-golden.png` });
    await page.context().close();
  }
  // a big file from a fresh page
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("body[data-ready]", { timeout: 60000 });
  const t0 = Date.now();
  await page.setInputFiles("#file", path.resolve("tests/golden/stress500.xlsx"));
  await page.getByRole("tab", { name: "Summary" }).click({ timeout: 60000 });
  await page.waitForSelector("[data-key][data-status]", { timeout: 60000 });
  check(true, `stress500.xlsx opened in ${Date.now() - t0} ms`);
  await browser.close();
  console.log(failed ? `${failed} failed` : "all upload checks passed");
  process.exit(failed ? 1 : 0);
})();
