// Combobox QA helpers (2026-11-19). Session from scripts/qa-session.ts (.qa/session.json).
import { chromium } from "@playwright/test";

export const BASE = (process.argv[2] || "http://localhost:4301").replace(/\/$/, "");
export const LONG = 600_000;

export async function launch() {
  return chromium.launch({ headless: true });
}

export async function ctx(browser, opts = {}) {
  return browser.newContext({ storageState: ".qa/session.json", ...opts });
}

export async function openNew(context) {
  const page = await context.newPage();
  page.setDefaultTimeout(LONG);
  await page.goto(`${BASE}/new`, { timeout: LONG });
  await page.getByRole("heading", { name: "Datos del proyecto" }).waitFor();
  return page;
}

/** The trigger button (not cmdk's input, which also is a combobox). */
export const trigger = (page) => page.locator("button[role=combobox]").filter({ hasText: /./ }).first();
export const repoTrigger = (page) => page.locator("form button[role=combobox][aria-haspopup=listbox]").first();
export const search = (page) => page.getByPlaceholder("Busca owner/repo");
export const options = (page) => page.locator("[cmdk-item]");
export const hiddenRepo = (page) => page.locator("input[type=hidden][name=repo]");
export const branch = (page) => page.locator("input[name=branch]");

export async function openPicker(page) {
  await repoTrigger(page).click();
  await search(page).waitFor();
}

export async function optionTexts(page) {
  return (await options(page).allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
}

export function isAction(req) {
  return req.method() === "POST" && !!req.headers()["next-action"];
}

export async function submit(page) {
  const [res] = await Promise.all([
    page.waitForResponse((r) => isAction(r.request()), { timeout: LONG }),
    page.getByRole("button", { name: "Crear proyecto" }).click(),
  ]);
  await res.finished();
  await page.waitForTimeout(800);
  return res;
}

export async function shownState(page) {
  const token = (await page.getByText(/^Token de despliegue de /).count()) > 0;
  const alerts = (await page.locator("[role=alert]").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
  const errs = (await page.locator("form [id$=-error], form p.text-destructive").allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  return { token, alerts, errs };
}
