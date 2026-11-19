// Repro 4: with the GitHub fake in `--fail 401` (expired/revoked read token), /new must say the
// token is no longer valid (not the generic "No se pudo cargar…"). Usage: node 4-token-caducado.mjs <base>
// Needs .qa/session.json, the fake running with --fail 401, and no cached OK list (restart the
// server or wait 5 min after the last successful load).
import { chromium } from "@playwright/test";

const BASE = (process.argv[2] || "http://localhost:4301").replace(/\/$/, "");
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ storageState: ".qa/session.json" });
  const page = await context.newPage();
  page.setDefaultTimeout(600_000);
  await page.goto(`${BASE}/new`, { timeout: 600_000 });
  await page.getByRole("heading", { name: "Datos del proyecto" }).waitFor();
  if (await page.locator("form button[role=combobox][aria-haspopup=listbox]").count()) {
    console.log("FAIL setup: the list loaded (is the fake in --fail 401? is an OK list cached?)");
  } else {
    const help = (await page.locator("form [id$=-help]").allInnerTexts()).find((t) => /repo/i.test(t)) ?? "";
    const generic = help.startsWith("No se pudo cargar la lista");
    const saysToken = /token/i.test(help);
    console.log(!generic && saysToken ? "PASS" : `FAIL hint="${help}"`);
  }
} finally {
  await browser.close();
}
