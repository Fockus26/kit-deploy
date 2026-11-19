import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://localhost:4302";
const b = await chromium.launch(); const res = [];
for (const rm of ["no-preference", "reduce"]) {
  const ctx = await b.newContext({ storageState: ".qa/session.json", viewport: { width: 1440, height: 900 }, reducedMotion: rm });
  const p = await ctx.newPage();
  await p.goto(base + "/p/maranatha/deployments", { waitUntil: "domcontentloaded", timeout: 600000 });
  await p.waitForTimeout(1500);
  const href = await p.evaluate(() => document.querySelector('a[href*="d="]').getAttribute("href"));
  await p.goto(base + href, { waitUntil: "domcontentloaded", timeout: 600000 });
  await p.waitForTimeout(2500);
  res.push(rm, await p.evaluate(() => { const e = document.querySelector("div.fixed.inset-y-0.z-50") ?? document.querySelector("[role=dialog]"); const s = getComputedStyle(e); return { right: Math.round(e.getBoundingClientRect().right), vw: innerWidth, td: s.transitionDuration, an: s.animationName, ad: s.animationDuration, role: e.getAttribute("role") }; }));
  await ctx.close();
}
await b.close(); console.log(JSON.stringify(res));
