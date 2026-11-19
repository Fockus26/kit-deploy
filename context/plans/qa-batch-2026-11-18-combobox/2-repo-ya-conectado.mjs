// Repro 2: a repo that already has a project, picked from the list, must be flagged in the list or
// the error must land on Repositorio (not on a free Nombre). Usage: node 2-repo-ya-conectado.mjs <base>
// Needs .qa/session.json and the GitHub fake (130 repos). Creates two projects in the local QA DB.
import { chromium } from "@playwright/test";

const BASE = (process.argv[2] || "http://localhost:4301").replace(/\/$/, "");
const stamp = Date.now().toString(36).slice(-5);
const REPO = `qa-org/repo-1${String(Number.parseInt(stamp, 36) % 30 + 1).padStart(2, "0")}`; // 101..130
const browser = await chromium.launch();
async function create(page, name) {
  await page.goto(`${BASE}/new`, { timeout: 600_000 });
  await page.locator("input[name=name]").fill(name);
  await page.locator("form button[role=combobox][aria-haspopup=listbox]").click();
  await page.getByPlaceholder("Busca owner/repo").fill(REPO);
  const opt = page.locator("[cmdk-item]").filter({ hasText: REPO }).first();
  const label = (await opt.innerText()).replace(/\s+/g, " ");
  await opt.click();
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && !!r.request().headers()["next-action"]),
    page.getByRole("button", { name: "Crear proyecto" }).click(),
  ]);
  await page.waitForTimeout(2500);
  return label;
}
try {
  const context = await browser.newContext({ storageState: ".qa/session.json" });
  const page = await context.newPage();
  page.setDefaultTimeout(600_000);
  await create(page, `rc_${stamp}_a`);
  const label = await create(page, `rc_${stamp}_b`);
  const invalid = await page.locator("form [aria-invalid=true]").evaluateAll((els) => els.map((e) => e.getAttribute("name") || (e.getAttribute("role") === "combobox" ? "repo" : e.id)));
  const flagged = label !== `${REPO}` && label !== `${REPO} Privado`;
  const ok = flagged || (invalid.includes("repo") && !invalid.includes("name"));
  console.log(ok ? "PASS" : `FAIL option="${label}" (not flagged) invalid=[${invalid.join(",")}]`);
} finally {
  await browser.close();
}
