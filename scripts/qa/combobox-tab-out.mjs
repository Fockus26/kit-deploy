// Guard (QA combobox 2026-11-19, Medio 1): with the Repositorio picker open, Tab must leave it (close it and move on to the next
// field), as in a native select / APG combobox. Usage: node scripts/qa/combobox-tab-out.mjs http://localhost:4301
// Needs .qa/session.json (bun scripts/qa-session.ts --port <p>) and the GitHub fake running.
import { chromium } from "@playwright/test";

const BASE = (process.argv[2] || "http://localhost:4301").replace(/\/$/, "");
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    storageState: ".qa/session.json",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(120_000);
  await page.goto(`${BASE}/new`, { timeout: 600_000 });
  const trigger = page.locator(
    "form button[role=combobox][aria-haspopup=listbox]",
  );
  await trigger.waitFor();
  await trigger.focus();
  await page.keyboard.press("Enter");
  await page.getByPlaceholder("Busca owner/repo").waitFor();
  await page.keyboard.press("Tab");
  await page.waitForTimeout(300);
  const focus = await page.evaluate(
    () =>
      document.activeElement?.getAttribute("placeholder") ??
      document.activeElement?.getAttribute("name") ??
      document.activeElement?.tagName,
  );
  const expanded = await trigger.getAttribute("aria-expanded");
  // Shift+Tab from the search: closes it back onto the trigger.
  await trigger.focus();
  await page.keyboard.press("Enter");
  await page.getByPlaceholder("Busca owner/repo").waitFor();
  await page.keyboard.press("Shift+Tab");
  await page.waitForTimeout(300);
  const backFocus = await page.evaluate(
    () =>
      document.activeElement?.getAttribute("role") ??
      document.activeElement?.tagName,
  );
  const backExpanded = await trigger.getAttribute("aria-expanded");
  const ok =
    focus !== "Busca owner/repo" &&
    expanded === "false" &&
    backFocus === "combobox" &&
    backExpanded === "false";
  console.log(
    ok
      ? "PASS"
      : `FAIL tab→focus=${focus} expanded=${expanded}; shift+tab→focus=${backFocus} expanded=${backExpanded}`,
  );
} finally {
  await browser.close();
}
