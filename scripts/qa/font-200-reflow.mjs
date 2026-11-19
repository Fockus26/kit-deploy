/**
 * Browser-font guard: with the browser's standard font at 200 % (32 px, via CDP
 * `Page.setFontSizes`) at 390 px wide, the page must not scroll sideways (WCAG 1.4.10). rem-based
 * `min-w-<n>` inside flex rows is what breaks it: use `min-w-0` + a `basis-*`.
 *
 *   node scripts/qa/font-200-reflow.mjs [baseUrl]       (default http://localhost:4301)
 * Needs .qa/session.json and qa-seed data. Run with node, not Bun.
 */
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:4301";
const b = await chromium.launch();
const ctx = await b.newContext({
  storageState: ".qa/session.json",
  viewport: { width: 390, height: 900 },
});
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
await cdp.send("Page.setFontSizes", { fontSizes: { standard: 32, fixed: 26 } });
const bad = [];
for (const r of [
  "/",
  "/new",
  "/settings",
  "/p/maranatha",
  "/p/maranatha/deployments",
  "/p/maranatha/env",
  "/p/maranatha/domains",
  "/p/maranatha/logs",
  "/p/maranatha/cron",
  "/p/maranatha/databases",
]) {
  await p.goto(base + r, { waitUntil: "domcontentloaded", timeout: 600000 });
  await p.waitForTimeout(1500);
  const d = await p.evaluate(() => [
    document.documentElement.scrollWidth,
    innerWidth,
  ]);
  if (d[0] > d[1]) bad.push(`${r} ${d[0]}>${d[1]}`);
}
await b.close();
console.log(bad.length ? `FAIL ${bad.join("; ")}` : "PASS");
process.exit(bad.length ? 1 : 0);
