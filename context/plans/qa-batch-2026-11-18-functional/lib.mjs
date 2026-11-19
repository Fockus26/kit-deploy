// QA helpers (batch 2026-11-18). Never prints secrets.
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

export const BASE = (process.argv[2] || "http://localhost:4301").replace(/\/$/, "");
export const PORT = new URL(BASE).port;
export const LONG = 10 * 60_000;

export function b32decode(s) {
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = s.replace(/[\s=]/g, "").toUpperCase();
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const i = alpha.indexOf(ch);
    if (i < 0) continue;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totp(secret, at = Date.now(), step = 0) {
  const counter = Math.floor(at / 1000 / 30) + step;
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", b32decode(secret)).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

/** A code guaranteed not equal to the current/adjacent valid ones. */
export function wrongCode(secret) {
  const valid = new Set([-1, 0, 1].map((s) => totp(secret, Date.now(), s)));
  for (let i = 0; ; i++) {
    const c = String((123456 + i * 7919) % 1_000_000).padStart(6, "0");
    if (!valid.has(c)) return c;
  }
}

/** Waits until a fresh 30 s window starts (so a code is not about to expire). */
export async function freshWindow(minLeftS = 12) {
  const left = 30 - ((Date.now() / 1000) % 30);
  if (left < minLeftS) await new Promise((r) => setTimeout(r, left * 1000 + 300));
}

export function pgUrl() {
  const mapped = execFileSync("docker", ["port", "qa-kit-deploy-pg", "5432"], { encoding: "utf8" });
  const pgPort = /:(\d+)\s*$/m.exec(mapped.split("\n")[0])[1];
  return `postgresql://qa_app:qa_app@127.0.0.1:${pgPort}/qa_${PORT}`;
}

/** SQL against the local QA database through the container's psql (read-only queries mostly). */
export function sql(query) {
  return execFileSync(
    "docker",
    ["exec", "qa-kit-deploy-pg", "psql", "-U", "qa_app", "-d", `qa_${PORT}`, "-At", "-F", "\t", "-c", query],
    { encoding: "utf8", env: { ...process.env, PGPASSWORD: "qa_app" } },
  ).trim();
}

export const SECRETS = ".qa/secrets.json"; // gitignored folder; never printed
export function loadSecrets() {
  return existsSync(SECRETS) ? JSON.parse(readFileSync(SECRETS, "utf8")) : {};
}
export function saveSecret(key, val) {
  const s = loadSecrets();
  s[key] = val;
  mkdirSync(".qa", { recursive: true });
  writeFileSync(SECRETS, JSON.stringify(s, null, 2), { mode: 0o600 });
}

export function enrolLink(email) {
  execFileSync("bun", ["scripts/qa-enrol-link.ts", email, BASE], {
    env: { ...process.env, DATABASE_URL: pgUrl() },
    stdio: ["ignore", "ignore", "inherit"],
  });
  return readFileSync(".qa/enrol-link.txt", "utf8").trim();
}

export async function launch() {
  return chromium.launch({ headless: true });
}

export async function virtualAuthenticator(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return { cdp, authenticatorId };
}

/**
 * Full enrolment of `email` (passkey + TOTP if the account has none). Returns the TOTP secret
 * (saved under secrets[`totp:${email}`]) or the existing one.
 */
export async function enrol(browser, email) {
  const link = enrolLink(email);
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(LONG);
  await virtualAuthenticator(page);
  await page.goto(link, { timeout: LONG });
  await page.getByRole("button", { name: "Registrar passkey" }).click();
  const step2 = page.getByText("Añade el código de respaldo");
  const done = page.getByText("Passkey añadida");
  await Promise.race([step2.waitFor(), done.waitFor()]);
  if (await done.isVisible()) {
    await context.close();
    return loadSecrets()[`totp:${email}`];
  }
  const secret = (await page.getByText("Si no puedes escanearlo").locator("xpath=following-sibling::p[1]").innerText()).replace(/\s/g, "");
  saveSecret(`totp:${email}`, secret);
  await freshWindow();
  await page.locator("#totp").fill(totp(secret));
  await page.getByRole("button", { name: "Confirmar código" }).click();
  await page.getByText("Guárdalos ahora").waitFor();
  const codes = await page.getByRole("list", { name: "Códigos de recuperación" }).locator("li").allInnerTexts();
  saveSecret(`backup:${email}`, codes);
  await page.locator("#saved").check();
  await page.getByRole("button", { name: "Terminar el alta" }).click();
  await page.getByRole("heading").first().waitFor();
  await context.close();
  return secret;
}

/** Sign in with email + TOTP on /login; returns a context with the session. */
export async function signInWithTotp(browser, email, secret) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(LONG);
  await page.goto(`${BASE}/login`, { timeout: LONG });
  await page.getByRole("button", { name: "Usar código de la app" }).click();
  await page.locator("input[name=email]").fill(email);
  await freshWindow();
  await page.locator("input[name=code]").fill(totp(secret));
  await page.locator("input[name=code]").press("Enter");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: LONG });
  await page.close();
  return context;
}

export function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`missing ${name} (run with --env-file=.env.test.local)`);
  return v;
}
