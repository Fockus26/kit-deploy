/**
 * The CLI's database URL on the VPS: `/etc/kit-deploy/cli.env` (root:kit-deploy 0640, written by
 * `infra/install.sh`). Whoever is in the kit-deploy group can already drive kit-agent, so reading
 * this adds no power; it lets `rollback` work with the web app stopped.
 */
import { readFileSync } from "node:fs";

export const CLI_ENV_PATH = "/etc/kit-deploy/cli.env";

/** Only these keys are taken from the file; anything else in it is ignored. */
const ALLOWED = new Set(["DATABASE_URL"]);

export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && /^(['"]).*\1$/.test(value))
      value = value.slice(1, -1);
    if (ALLOWED.has(key)) out[key] = value;
  }
  return out;
}

/** Fills what the environment does not already set. A missing or unreadable file is not an error
 * here: the command that needs the database says so. */
export function loadCliEnv(
  path = CLI_ENV_PATH,
  env: Record<string, string | undefined> = process.env,
): void {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const [k, v] of Object.entries(parseEnvFile(text))) {
    if (!env[k]) env[k] = v;
  }
}
