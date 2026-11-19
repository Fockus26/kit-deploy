import { existsSync } from "node:fs";
import { BASE, LONG, env, launch, loadSecrets, signInWithTotp } from "./lib.mjs";

export const EMAIL = () => env("EMAIL_TEST").toLowerCase();
export const SECRET = () => loadSecrets()[`totp:${EMAIL()}`];

/** A signed-in context (reuses .qa/session-a.json while it is valid). */
export async function signedIn(browser, { fresh = false } = {}) {
  if (!fresh && existsSync(".qa/session-a.json")) {
    const ctx = await browser.newContext({ storageState: ".qa/session-a.json" });
    const p = await ctx.newPage();
    p.setDefaultTimeout(LONG);
    const res = await p.goto(`${BASE}/settings`, { timeout: LONG });
    const ok = !p.url().includes("/login") && res && res.status() < 400;
    await p.close();
    if (ok) return ctx;
    await ctx.close();
  }
  const ctx = await signInWithTotp(browser, EMAIL(), SECRET());
  await ctx.storageState({ path: ".qa/session-a.json" });
  return ctx;
}

export async function settings(ctx) {
  const page = await ctx.newPage();
  page.setDefaultTimeout(LONG);
  await page.goto(`${BASE}/settings`, { timeout: LONG });
  await page.getByRole("table", { name: "Passkeys de tu cuenta" }).waitFor();
  return page;
}

export function dialog(page) {
  return page.getByRole("alertdialog");
}

/** Opens the Eliminar dialog of the n-th passkey row (0-based). */
export async function openRemove(page, n = 0) {
  const table = page.getByRole("table", { name: "Passkeys de tu cuenta" });
  await table.getByRole("button", { name: /^Eliminar la passkey/ }).nth(n).click();
  await dialog(page).waitFor();
  return dialog(page);
}

export function isAction(req) {
  return req.method() === "POST" && !!req.headers()["next-action"];
}

/** Clicks "Eliminar passkey" and waits for the action's response. */
export async function submit(page) {
  const d = dialog(page);
  const [res] = await Promise.all([
    page.waitForResponse((r) => isAction(r.request()), { timeout: LONG }),
    d.getByRole("button", { name: "Eliminar passkey" }).click(),
  ]);
  await res.finished();
  await page.waitForTimeout(400);
  return res;
}

export { BASE, LONG, launch };
