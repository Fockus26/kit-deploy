// What /new shows for the current fake mode: combobox or plain input, the hint, how long it took.
// Usage: node .qa/p8-fail.mjs <base> <label>
import { ctx, launch } from "./cb-common.mjs";

const BASE = (process.argv[2] || "http://localhost:4301").replace(/\/$/, "");
const label = process.argv[3] || "?";
const browser = await launch();
try {
  const c = await ctx(browser);
  const page = await c.newPage();
  page.setDefaultTimeout(600_000);
  const t0 = Date.now();
  await page.goto(`${BASE}/new`, { timeout: 600_000 });
  await page.getByRole("heading", { name: "Datos del proyecto" }).waitFor();
  const ms = Date.now() - t0;
  const combobox = await page.locator("form button[role=combobox][aria-haspopup=listbox]").count();
  const plain = await page.locator("input[name=repo]:not([type=hidden])").count();
  const helps = await page.locator("form p.text-muted-foreground, form [id$=-help]").allInnerTexts();
  const html = await page.content();
  let opts = null, emptyMsg = null;
  if (combobox) {
    await page.locator("form button[role=combobox][aria-haspopup=listbox]").click();
    await page.getByPlaceholder("Busca owner/repo").waitFor();
    opts = await page.locator("[cmdk-item]").count();
    emptyMsg = await page.locator("[cmdk-empty]").innerText().catch(() => null);
    await page.screenshot({ path: `.qa/p8-${label}.png` });
  } else {
    await page.screenshot({ path: `.qa/p8-${label}.png`, fullPage: true });
  }
  console.log(JSON.stringify({ label, ms, combobox, plain, opts, emptyMsg, repoHelp: helps.filter((h) => /repo/i.test(h)), leaks: ["qafake", "401", "403", "502", "4310"].filter((n) => html.includes(`>${n}<`) || html.includes("qafake") && n === "qafake") }));
} finally {
  await browser.close();
}
