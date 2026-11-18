/**
 * `db.status` (phase 05, brief F11, D035): a project's two kit-db databases — `<project>` and
 * `<project>_preview` — with their size and last backup, read from `kit-db list` and
 * `kit-db status`. Both commands print every database on the central Postgres: only the project's
 * own two lines ever leave this file, never another database's name, size or failure.
 */
import type { Deps } from "./deps";
import { AgentError, isPreviewsName, scrubUrls } from "./ops";

export type DatabaseStatus = {
  name: string;
  env: "production" | "preview";
  /** From pg_size_pretty, so rounded to its unit; null when the text is not one it prints. */
  sizeBytes: number | null;
  sizeText: string;
  /** kit-db's newest dump; `at` from its name, null when the name is not kit-db's format. */
  lastBackup: { file: string; at: string | null } | null;
};

export type DbStatus = {
  databases: DatabaseStatus[];
  /** The off-VPS copy's rclone remote, null when not configured. */
  offVps: string | null;
  /** kit-db's last `FAIL` lines (up to 5) that name one of the project's two databases. */
  failures: string[];
};

const TIMEOUT_MS = 30_000;
const MAX_LINE = 300;

/** pg_size_pretty's units: powers of 1024, `bytes` below 10 kB. */
const UNITS: Record<string, number> = {
  bytes: 1,
  kB: 1024,
  MB: 1024 ** 2,
  GB: 1024 ** 3,
  TB: 1024 ** 4,
  PB: 1024 ** 5,
};

export function parseSize(text: string): number | null {
  const m = /^(\d+(?:\.\d+)?) (bytes|kB|MB|GB|TB|PB)$/.exec(text);
  if (!m?.[1] || !m[2]) return null;
  const unit = UNITS[m[2]];
  return unit === undefined ? null : Math.round(Number(m[1]) * unit);
}

/** `kit-db list`: `datname size` per line (psql unaligned, space-separated). */
export function parseList(stdout: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const raw of stdout.split("\n")) {
    const line = raw.trim();
    const m = /^([a-z][a-z0-9_]*)\s+(.+)$/.exec(line);
    if (m?.[1] && m[2]) out.set(m[1], m[2].replace(/\s+/g, " "));
  }
  return out;
}

/** `<db>-YYYYmmdd-HHMMSS.dump`, as kit-db's backup_one names it (`date` on the VPS: UTC). */
export function backupTime(db: string, file: string): string | null {
  if (!file.startsWith(`${db}-`)) return null;
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.dump$/.exec(
    file.slice(db.length + 1),
  );
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number) as number[];
  const t = Date.UTC(y ?? 0, (mo ?? 1) - 1, d ?? 0, h ?? 0, mi ?? 0, s ?? 0);
  const date = new Date(t);
  // 20261399-… parses to another day: a name that is not a real moment has no time.
  if (
    Number.isNaN(t) ||
    date.getUTCDate() !== d ||
    date.getUTCMonth() + 1 !== mo
  )
    return null;
  return date.toISOString();
}

/** A named rclone remote and path (`r2:kit-backups`). An on-the-fly one (`:s3,key=…:`) can carry
 * credentials in the string itself: only that it is configured comes back. */
function remoteLabel(remote: string): string {
  return /^[A-Za-z0-9_-]{1,64}:[A-Za-z0-9._/-]{0,200}$/.test(remote)
    ? remote
    : "(configured)";
}

/** One line from kit-db, safe for a response: no URL, no control characters, bounded. */
function clean(line: string): string {
  const t = scrubUrls(line)
    .replace(/\p{Cc}/gu, " ")
    .trim();
  return t.length > MAX_LINE ? `${t.slice(0, MAX_LINE)}…` : t;
}

export type ParsedStatus = {
  backups: Map<string, string | null>;
  remote: string | null;
  failures: string[];
};

/** `kit-db status`: `<db>: <file>.dump | NO BACKUP` per database, `Off-VPS: …`, then
 * `Last failures:` and its `FAIL <date> <db>: <why>` lines. */
export function parseStatus(stdout: string): ParsedStatus {
  const backups = new Map<string, string | null>();
  let remote: string | null = null;
  const failures: string[] = [];
  let inFailures = false;
  for (const raw of stdout.split("\n")) {
    const line = raw.trim();
    if (line === "") continue;
    if (inFailures) {
      if (line.startsWith("FAIL ")) failures.push(line);
      continue;
    }
    if (line === "Last failures:") {
      inFailures = true;
      continue;
    }
    if (line.startsWith("Off-VPS:")) {
      const v = line.slice("Off-VPS:".length).trim();
      remote = v === "" || v === "NOT CONFIGURED" ? null : v;
      continue;
    }
    const m = /^([a-z][a-z0-9_]*):\s*(.*)$/.exec(line);
    if (!m?.[1]) continue;
    const value = (m[2] ?? "").trim();
    backups.set(m[1], value === "" || value === "NO BACKUP" ? null : value);
  }
  return { backups, remote, failures };
}

/** The third field of `FAIL <date> <db>: …` is exactly one of `names` followed by `:`. */
function namesOne(line: string, names: readonly string[]): boolean {
  const db = line.split(/\s+/)[2] ?? "";
  return names.some((n) => db === `${n}:`);
}

async function kitDb(deps: Deps, cmd: "list" | "status"): Promise<string> {
  const r = await deps.run(["kit-db", cmd], { timeoutMs: TIMEOUT_MS });
  if (r.code !== 0) {
    const err = r.stderr.trim();
    throw new AgentError(
      "command_failed",
      `kit-db ${cmd} failed (exit ${r.code}): ${clean(err.length > 1000 ? err.slice(-1000) : err)}`,
    );
  }
  return r.stdout;
}

export async function dbStatus(deps: Deps, project: string): Promise<DbStatus> {
  // `shop_preview` would be `shop`'s previews database, not a project of its own.
  if (isPreviewsName(project)) {
    throw new AgentError(
      "bad_request",
      `${project}: a name ending in _preview is another project's previews database`,
    );
  }
  const own = [
    { name: project, env: "production" as const },
    { name: `${project}_preview`, env: "preview" as const },
  ];
  const names = own.map((d) => d.name);
  const sizes = parseList(await kitDb(deps, "list"));
  const status = parseStatus(await kitDb(deps, "status"));

  const databases: DatabaseStatus[] = [];
  for (const { name, env } of own) {
    const sizeText = sizes.get(name);
    if (sizeText === undefined) continue;
    const file = status.backups.get(name) ?? null;
    databases.push({
      name,
      env,
      sizeBytes: parseSize(sizeText),
      sizeText: clean(sizeText),
      lastBackup:
        file === null
          ? null
          : { file: clean(file), at: backupTime(name, file) },
    });
  }

  const offVps = status.remote === null ? null : remoteLabel(status.remote);
  const failures = status.failures
    .filter((l) => namesOne(l, names))
    .map((l) => {
      // An upload failure names the remote: the same label as offVps, never more.
      const line =
        status.remote === null || offVps === null
          ? l
          : l.replaceAll(status.remote, offVps);
      return clean(line);
    });
  return { databases, offVps, failures };
}
