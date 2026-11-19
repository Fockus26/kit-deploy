import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://localhost:4302";
const b = await chromium.launch(); const ctx = await b.newContext({ storageState: ".qa/session.json", viewport: { width: 390, height: 900 } });
const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
await cdp.send("Page.setFontSizes", { fontSizes: { standard: 32, fixed: 26 } });
const bad = [];
for (const r of ["/settings", "/p/maranatha", "/p/maranatha/env", "/p/maranatha/domains", "/p/maranatha/cron"]) {
  await p.goto(base + r, { waitUntil: "domcontentloaded", timeout: 600000 }); await p.waitForTimeout(1500);
  const d = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  if (d[0] > d[1]) bad.push(`${r} ${d[0]}>${d[1]}`);
}
await b.close(); console.log(bad.length ? "FAIL " + bad.join("; ") : "PASS");
