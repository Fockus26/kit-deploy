// Repro 1 (Medio): after "Eliminar passkey" succeeds, the notice «Passkey … eliminada» never shows
// and focus falls to <body>.
// Run from the slot root:  node --env-file=.env.test.local .qa/repro/1-aviso-passkey-eliminada.mjs http://localhost:4301
// Needs the qa:local server for that port. Enrols EMAIL_TEST (passkey + TOTP) if not done yet.
import { enrol, env, freshWindow, launch, loadSecrets, sql, totp } from "../lib.mjs";
import { dialog, isAction, settings, signedIn } from "../pk-common.mjs";

const email = env("EMAIL_TEST").toLowerCase();
const browser = await launch();
try {
  if (!loadSecrets()[`totp:${email}`]) await enrol(browser, email);
  const secret = loadSecrets()[`totp:${email}`];
  const uid = sql(`select id from auth_user where email='${email}'`);
  const id = `qaRepro${Date.now()}`;
  sql(`insert into auth_passkey(id,name,public_key,user_id,credential_id,counter,device_type,backed_up,transports) values ('${id}','repro ${id}','x','${uid}','cred-${id}',0,'singleDevice',false,'internal')`);
  const ctx = await signedIn(browser);
  const page = await settings(ctx);
  await page.getByRole("button", { name: `Eliminar la passkey «repro ${id}»` }).click();
  await dialog(page).waitFor();
  await new Promise((r) => setTimeout(r, 31_000)); // a code window no earlier run spent
  await freshWindow(15);
  await dialog(page).locator("input[name=code]").fill(totp(secret));
  await Promise.all([
    page.waitForResponse((r) => isAction(r.request())),
    dialog(page).getByRole("button", { name: "Eliminar passkey" }).click(),
  ]);
  await page.waitForTimeout(2500);
  const gone = sql(`select count(*) from auth_passkey where id='${id}'`) === "0";
  const notice = (await page.locator("output").allInnerTexts()).some((t) => t.includes("eliminada"));
  const active = await page.evaluate(() => document.activeElement?.tagName);
  if (gone && notice && active !== "BODY") console.log("PASS");
  else console.log(`FAIL removed=${gone} notice=${notice} focus=${active}${gone ? "" : ` (dialog: ${(await dialog(page).innerText().catch(() => "-")).match(/Demasiados[^.]*.|ya se usó|no coincide|caducado/)?.[0] ?? "?"})`}`);
} finally {
  await browser.close();
}
