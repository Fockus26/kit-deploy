// Repro 3: closing the Repositorio picker with Esc must clear its search, and reopening must
// highlight the chosen repo. Usage: node 3-query-persiste.mjs http://localhost:4301
// Needs .qa/session.json and the GitHub fake (130 repos).
import { chromium } from "@playwright/test";

const BASE = (process.argv[2] || "http://localhost:4301").replace(/\/$/, "");
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ storageState: ".qa/session.json" });
  const page = await context.newPage();
  page.setDefaultTimeout(600_000);
  await page.goto(`${BASE}/new`, { timeout: 600_000 });
  const trigger = page.locator("form button[role=combobox][aria-haspopup=listbox]");
  const search = page.getByPlaceholder("Busca owner/repo");
  await trigger.click();
  await search.fill("repo-050");
  await page.locator("[cmdk-item]").filter({ hasText: "qa-org/repo-050" }).click();
  await trigger.click();
  await search.fill("repo-01");
  await page.keyboard.press("Escape");
  await trigger.click();
  await search.waitFor();
  const q = await search.inputValue();
  const n = await page.locator("[cmdk-item]").count();
  const hl = (await page.locator("[cmdk-item][data-selected=true]").innerText()).split("\n")[0];
  const ok = q === "" && n === 130 && hl === "qa-org/repo-050";
  console.log(ok ? "PASS" : `FAIL query="${q}" options=${n} highlighted=${hl}`);
} finally {
  await browser.close();
}
