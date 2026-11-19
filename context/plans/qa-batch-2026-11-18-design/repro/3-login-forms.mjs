import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://localhost:4302";
const S = "C:/Users/Cesar/Documents/Work/kit-deploy/context/plans/qa-batch-2026-11-18-design";
const b = await chromium.launch(); const out = [];
for (const [w, theme] of [[360, "light"], [1280, "dark"]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 800 } });
  await ctx.addInitScript((t) => localStorage.setItem("kd-theme", t), theme);
  const p = await ctx.newPage();
  for (const label of ["Usar código de la app", "Usar código de recuperación"]) {
    await p.goto(base + "/login", { waitUntil: "domcontentloaded", timeout: 600000 });
    await p.getByRole("button", { name: label }).click({ timeout: 60000 });
    await p.waitForTimeout(600);
    out.push(`${w} ${label} sw=${await p.evaluate(() => document.documentElement.scrollWidth)} focus=${await p.evaluate(() => document.activeElement?.tagName + ":" + (document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.id))}`);
    await p.screenshot({ path: `${S}/login-${label.includes("app") ? "totp" : "recovery"}-${w}-${theme}.jpg`, type: "jpeg", quality: 55 });
  }
  await ctx.close();
}
await b.close(); console.log(out.join("\n"));
