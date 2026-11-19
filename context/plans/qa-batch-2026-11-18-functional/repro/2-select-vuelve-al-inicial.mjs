// Repro 2 (Alto): after a refused submit, an OptionSelect inside a Server Action form jumps back to
// its first value (Radix Select listens to the form's "reset", which React fires after the action).
//  a) Nuevo proyecto: Memoria 1024 MB → refused name → fix name → project saved with 512 MB.
//  b) Ajustes › Nuevo token: project maranatha → refused label → fix → token minted for another project.
// Run from the slot root:  node --env-file=.env.test.local .qa/repro/2-select-vuelve-al-inicial.mjs http://localhost:4301
// Needs the qa:local server for that port, EMAIL_TEST enrolled (.qa/setup-accounts.mjs) and the
// demo projects (bun scripts/qa-session.ts --port <port> --demo).
import { BASE, LONG, launch, sql } from "../lib.mjs";
import { isAction, signedIn } from "../pk-common.mjs";

const send = async (page, button) => {
  await Promise.all([page.waitForResponse((r) => isAction(r.request()), { timeout: LONG }), button.click()]);
  await page.waitForTimeout(800);
};
const browser = await launch();
const fails = [];
try {
  const ctx = await signedIn(browser);
  const tag = Date.now().toString(36);

  // a) Nuevo proyecto
  const page = await ctx.newPage();
  page.setDefaultTimeout(LONG);
  await page.goto(`${BASE}/new`, { timeout: LONG });
  await page.locator("input[name=name]").fill("Mayusculas"); // refused: uppercase
  await page.locator("input[name=repo]").fill(`qa/repro2-${tag}`);
  await page.getByRole("combobox", { name: "Memoria" }).click();
  await page.getByRole("option", { name: "1024 MB" }).click();
  await send(page, page.getByRole("button", { name: "Crear proyecto" }));
  const shown = await page.getByRole("combobox", { name: "Memoria" }).innerText();
  await page.locator("input[name=name]").fill(`repro2_${tag}`);
  await send(page, page.getByRole("button", { name: "Crear proyecto" }));
  const mb = sql(`select memory_mb from projects where name='repro2_${tag}'`);
  if (mb !== "1024") fails.push(`memoria: shown-after-error="${shown}" saved=${mb}MB (chosen 1024)`);

  // b) Ajustes › Nuevo token
  const s = await ctx.newPage();
  s.setDefaultTimeout(LONG);
  await s.goto(`${BASE}/settings`, { timeout: LONG });
  const form = s.getByRole("form", { name: "Nuevo token" });
  const combo = form.getByRole("combobox", { name: "Proyecto" });
  await combo.click();
  await s.getByRole("option", { name: "maranatha", exact: true }).click();
  const label = form.locator("input[name=label]");
  await label.evaluate((el) => el.removeAttribute("maxlength"));
  await label.fill("z".repeat(101)); // refused by the server: over 100 characters
  await send(s, form.getByRole("button", { name: "Crear token" }));
  await label.fill(`repro2-${tag}`);
  await send(s, form.getByRole("button", { name: "Crear token" }));
  const project = sql(`select p.name from deploy_tokens t join projects p on p.id=t.project_id where t.label='repro2-${tag}'`);
  if (project !== "maranatha") fails.push(`token: minted for "${project}" (chosen maranatha)`);

  console.log(fails.length ? `FAIL ${fails.join("; ")}` : "PASS");
} finally {
  await browser.close();
}
