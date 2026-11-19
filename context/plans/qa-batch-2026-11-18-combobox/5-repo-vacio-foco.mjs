// Repro 5: submitting Nuevo proyecto without a repo picked must stop in the browser (like Nombre
// and Rama, which are `required`) or, after the server's "Falta el repositorio.", leave the focus on
// the Repositorio field — not on <body>. Usage: node 5-repo-vacio-foco.mjs <base>
// Needs .qa/session.json and the GitHub fake with a list (combobox visible).
import { chromium } from "@playwright/test";

const BASE = (process.argv[2] || "http://localhost:4301").replace(/\/$/, "");
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ storageState: ".qa/session.json" });
  const page = await context.newPage();
  page.setDefaultTimeout(600_000);
  await page.goto(`${BASE}/new`, { timeout: 600_000 });
  const trigger = page.locator("form button[role=combobox][aria-haspopup=listbox]");
  await trigger.waitFor();
  let posts = 0;
  page.on("request", (r) => { if (r.method() === "POST" && r.headers()["next-action"]) posts++; });
  await page.locator("input[name=name]").fill(`v_${Date.now().toString(36).slice(-5)}`);
  await page.locator("input[name=name]").press("Enter");
  await page.waitForTimeout(6000);
  const err = await page.getByText("Falta el repositorio.").count();
  const onTrigger = await trigger.evaluate((el) => el === document.activeElement);
  const focus = await page.evaluate(() => document.activeElement?.tagName.toLowerCase());
  const ok = posts === 0 || onTrigger;
  console.log(ok ? "PASS" : `FAIL posts=${posts} serverError=${err > 0} focus=${focus}`);
} finally {
  await browser.close();
}
