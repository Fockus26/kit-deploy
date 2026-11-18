/**
 * Reflow guard of the panel (phase 05 W12, phases/ui/08-RESPONSIVE-POLISH.md): walks every panel
 * route at 320, 360, 768, 1024, 1440 and 1920 px, in light and dark, plus a 200 % zoom at 1280
 * (= a 640 px viewport), and fails when the page scrolls sideways (`scrollWidth > clientWidth`
 * of <html>). It also names the elements poking out of the viewport so a failure says where.
 * A wide table that scrolls inside its own box is fine: only what leaks to the page counts.
 *
 *   bun run qa:local -- --port 4301 --preview        # wait for "QA ready"
 *   bun scripts/qa-session.ts --port 4301 --demo     # → .qa/session.json
 *   bun scripts/qa-seed.ts --port 4301
 *   node scripts/qa/panel-reflow.mjs --port 4301     # exit 1 if anything overflows
 *
 * Options: --port <p> (default 4301) · --project <name> (default maranatha, a qa-seed project)
 *          --session <file> (default .qa/session.json) · --json <file> (write the findings)
 *          --only <substring> (only routes whose path contains it) · --quick (320/768/1440, dark)
 * Needs @playwright/test (a dev dependency). Run with node, not Bun (Bun hangs on Windows).
 */
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const port = opt("port", "4301");
const project = opt("project", "maranatha");
const session = opt("session", ".qa/session.json");
const jsonOut = opt("json", "");
const only = opt("only", "");
const quick = args.includes("--quick");
const base = `http://localhost:${port}`;

const ROUTES = [
  "/",
  "/new",
  "/settings",
  `/p/${project}`,
  `/p/${project}/deployments`,
  `/p/${project}/env`,
  `/p/${project}/domains`,
  `/p/${project}/previews`,
  `/p/${project}/logs`,
  `/p/${project}/databases`,
  "/p/no-existe-este-proyecto",
].filter((r) => r.includes(only));
const WIDTHS = quick
  ? [320, 768, 1440]
  : [320, 360, 768, 1024, 1440, 1920, { zoom: 200, at: 1280 }];
const THEMES = quick ? ["dark"] : ["light", "dark"];

/** Runs in the page: the elements whose box leaves the viewport's width. */
function offenders() {
  const vw = document.documentElement.clientWidth;
  const out = [];
  for (const el of document.body.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.right <= vw + 1) continue;
    // Inside a box that scrolls or clips on its own: not a leak.
    let boxed = false;
    for (
      let p = el.parentElement;
      p && p !== document.body;
      p = p.parentElement
    ) {
      const o = getComputedStyle(p);
      if (/(auto|scroll|hidden|clip)/.test(o.overflowX)) {
        boxed = true;
        break;
      }
    }
    if (boxed) continue;
    const cls =
      typeof el.className === "string"
        ? el.className.trim().split(/\s+/).slice(0, 4).join(".")
        : "";
    out.push(
      `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""} right=${Math.round(r.right)} vw=${vw}`,
    );
    if (out.length >= 5) break;
  }
  return out;
}

const browser = await chromium.launch();
const failures = [];
let checked = 0;
for (const theme of THEMES) {
  for (const w of WIDTHS) {
    const width = typeof w === "number" ? w : Math.round(w.at / (w.zoom / 100));
    const label = typeof w === "number" ? `${w}px` : `zoom${w.zoom}%@${w.at}`;
    const ctx = await browser.newContext({
      storageState: session,
      viewport: { width, height: 900 },
    });
    await ctx.addInitScript((t) => localStorage.setItem("kd-theme", t), theme);
    const page = await ctx.newPage();
    for (const route of ROUTES) {
      await page.goto(base + route, {
        waitUntil: "domcontentloaded",
        timeout: 120000,
      });
      // Loading skeletons are aria-busy: wait for the real content.
      await page
        .waitForFunction(
          () => !document.querySelector('[aria-busy="true"]'),
          null,
          { timeout: 60000 },
        )
        .catch(() => {});
      await page.waitForTimeout(250);
      const list = await page.evaluate(offenders);
      const r = await page.evaluate(() => ({
        list: [],
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
      }));
      r.list = list;
      checked++;
      if (r.sw > r.cw) {
        failures.push({
          route,
          theme,
          width: label,
          scrollWidth: r.sw,
          clientWidth: r.cw,
          offenders: r.list,
        });
        console.log(
          `FAIL ${route} ${theme} ${label}: scrollWidth ${r.sw} > ${r.cw}\n     ${r.list.join("\n     ")}`,
        );
      }
    }
    await ctx.close();
  }
}
await browser.close();
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(failures, null, 2));
console.log(`${checked} page views, ${failures.length} with horizontal scroll`);
process.exit(failures.length ? 1 : 0);
