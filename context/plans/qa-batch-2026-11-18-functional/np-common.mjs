import { BASE, LONG } from "./lib.mjs";
import { isAction } from "./pk-common.mjs";

export async function newPage(ctx) {
  const page = await ctx.newPage();
  page.setDefaultTimeout(LONG);
  await page.goto(`${BASE}/new`, { timeout: LONG });
  await page.getByRole("heading", { name: "Datos del proyecto" }).waitFor();
  return page;
}

export const field = (page, label) => page.getByLabel(label, { exact: true });

/** Fills the plain fields, lifting the browser's own limits so the server sees the raw value. */
export async function fill(page, { name, repo, branch }) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("form input")) {
      el.removeAttribute("required");
      el.removeAttribute("maxlength");
    }
  });
  if (name !== undefined) await page.locator("input[name=name]").fill(name);
  if (repo !== undefined) await page.locator("input[name=repo]").fill(repo);
  if (branch !== undefined) await page.locator("input[name=branch]").fill(branch);
}

export async function pickMemory(page, label) {
  await page.getByRole("combobox", { name: "Memoria" }).click();
  await page.getByRole("option", { name: label }).click();
}

/** Submits "Crear proyecto" and returns what the page shows. */
export async function create(page) {
  const [res] = await Promise.all([
    page.waitForResponse((r) => isAction(r.request()), { timeout: LONG }),
    page.getByRole("button", { name: "Crear proyecto" }).click(),
  ]);
  await res.finished();
  await page.waitForTimeout(600);
  return state(page);
}

export async function state(page) {
  const token = await page.getByText(/^Token de despliegue de /).count();
  const notice = await page.locator("[role=alert], [data-slot=notice]").allInnerTexts().catch(() => []);
  const errors = await page.locator("[id$=-error], [data-slot=field-error], p.text-destructive").allInnerTexts().catch(() => []);
  return {
    token: token > 0,
    notice: notice.map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean),
    errors: errors.map((t) => t.trim()).filter(Boolean),
    memory: token ? null : await page.getByRole("combobox", { name: "Memoria" }).innerText().catch(() => null),
    memoryNative: token ? null : await page.locator("select[name=memoryMb]").inputValue().catch(() => null),
  };
}
