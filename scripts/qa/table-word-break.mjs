/**
 * Table word-break guard: fails when a short word (4-14 chars) is split over more than one line
 * on any panel route at 320-768 px. Cells must not wrap (tables scroll inside their card); only
 * DataTable `wrapColumns` may break, and they keep a floor width.
 *
 *   node scripts/qa/table-word-break.mjs [baseUrl]      (default http://localhost:4301)
 * Needs .qa/session.json (bun scripts/qa-session.ts) and qa-seed data. Run with node, not Bun.
 */
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:4301";
const routes = [
  "/",
  "/new",
  "/settings",
  "/p/maranatha",
  "/p/maranatha/deployments",
  "/p/maranatha/previews",
  "/p/maranatha/env",
  "/p/maranatha/domains",
  "/p/maranatha/databases",
  "/p/maranatha/logs",
  "/p/maranatha/cron",
];
const b = await chromium.launch();
const fails = [];
for (const w of [320, 360, 390, 430, 768]) {
  const ctx = await b.newContext({
    storageState: ".qa/session.json",
    viewport: { width: w, height: 900 },
  });
  const page = await ctx.newPage();
  for (const r of routes) {
    await page.goto(base + r, {
      waitUntil: "domcontentloaded",
      timeout: 600000,
    });
    await page
      .waitForFunction(
        () => !document.querySelector('[aria-busy="true"]'),
        null,
        { timeout: 60000 },
      )
      .catch(() => {});
    await page.waitForTimeout(300);
    const hits = await page.evaluate(() => {
      const out = new Set();
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
      );
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const p = n.parentElement;
        if (!p || p.closest(".sr-only,script,style")) continue;
        const re = /\S+/g;
        let m;
        while ((m = re.exec(n.data))) {
          if (m[0].length < 4 || m[0].length > 14) continue;
          const rg = document.createRange();
          rg.setStart(n, m.index);
          rg.setEnd(n, m.index + m[0].length);
          const lines = new Set(
            [...rg.getClientRects()]
              .filter((x) => x.width > 0)
              .map((x) => Math.round(x.top)),
          );
          if (lines.size > 1) out.add(m[0]);
        }
      }
      return [...out];
    });
    if (hits.length) fails.push(`${r}@${w}: ${hits.slice(0, 8).join(",")}`);
  }
  await ctx.close();
}
await b.close();
console.log(fails.length ? `FAIL\n${fails.join("\n")}` : "PASS");
process.exit(fails.length ? 1 : 0);
