/**
 * The CLI's database URL on the VPS: `/etc/kit-deploy/cli.env` (root:kit-deploy 0640, written by
 * `infra/install.sh`). Whoever is in the kit-deploy group can already drive kit-agent, so reading
 * this adds no power; it lets `rollback` work with the web app stopped.
 */
import { readFileSync } from "node:fs";

export const CLI_ENV_PATH = "/etc/kit-deploy/cli.env";
/** The platform's GitHub token for commit statuses: root 0600, so only `ssh kit-vps` (root) reads
 * it; as a kit-deploy group member the CLI deploys without publishing the status. */
export const GITHUB_ENV_PATH = "/etc/kit-deploy/github.env";

/** The alerts' Brevo key and recipient (`kit-deploy alerts setup`): root 0600, like github.env. */
export const ALERTS_ENV_PATH = "/etc/kit-deploy/alerts.env";

/** Only these keys are taken from each file; anything else in it is ignored. */
const CLI_KEYS: ReadonlySet<string> = new Set(["DATABASE_URL"]);
const GITHUB_KEYS: ReadonlySet<string> = new Set(["GITHUB_STATUS_TOKEN"]);
const ALERTS_KEYS: ReadonlySet<string> = new Set([
  "ALERTS_BREVO_KEY",
  "ALERTS_TO",
]);

export function parseEnvFile(
  text: string,
  allowed: ReadonlySet<string> = CLI_KEYS,
): Record<string, string> {
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
    if (allowed.has(key)) out[key] = value;
  }
  return out;
}

/** Fills what the environment does not already set. A missing or unreadable file is not an error
 * here: the command that needs the database says so. */
export function loadCliEnv(
  path = CLI_ENV_PATH,
  env: Record<string, string | undefined> = process.env,
  allowed: ReadonlySet<string> = CLI_KEYS,
): void {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const [k, v] of Object.entries(parseEnvFile(text, allowed))) {
    if (!env[k]) env[k] = v;
  }
}

/** `github.env` if this user may read it (root); otherwise statuses stay off for this run. */
export function loadGithubEnv(
  path = GITHUB_ENV_PATH,
  env: Record<string, string | undefined> = process.env,
): void {
  loadCliEnv(path, env, GITHUB_KEYS);
}

/** `alerts.env` if this user may read it (root); otherwise no email this run (they wait). */
export function loadAlertsEnv(
  path = ALERTS_ENV_PATH,
  env: Record<string, string | undefined> = process.env,
): void {
  loadCliEnv(path, env, ALERTS_KEYS);
}

/** `alerts setup`: the two lines, 0600 root, written to a temp file and renamed over. */
export async function writeAlertsEnv(
  key: string,
  to: string,
  path = ALERTS_ENV_PATH,
): Promise<void> {
  const { chmod, rename, rm, writeFile } = await import("node:fs/promises");
  const tmp = `${path}.tmp`;
  await rm(tmp, { force: true });
  await writeFile(
    tmp,
    `# Written by kit-deploy alerts setup. Root 0600; never printed.
ALERTS_BREVO_KEY=${key}
ALERTS_TO=${to}
`,
    { flag: "wx", mode: 0o600 },
  );
  await chmod(tmp, 0o600);
  await rename(tmp, path);
}
