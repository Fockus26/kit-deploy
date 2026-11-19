/**
 * Pure rules of the Logs and Bases pages (HANDOFF §3): reading the filters from the URL, turning
 * agent entries into viewer lines and a `.log` file, and the backup badge. No I/O, so the tests
 * run without a server.
 */
import type { LogLevel, LogLine } from "@/components/kit/log-viewer";

export const LOG_LEVELS = ["error", "warn", "info"] as const;
/** Same shape as the agent's `logs.*` env filter. */
export const LOG_ENV = /^(?:production|pr-[1-9][0-9]{0,5})$/;
export const LOG_DAY = /^\d{4}-\d{2}-\d{2}$/;
export const LOG_QUERY_MAX = 200;
/** Lines of the follow view (the agent's `lines` goes up to 500). */
export const FOLLOW_LINES = 200;
export const FOLLOW_EVERY_MS = 2_000;
export const SEARCH_PAGE = 200;

export type LogRow = { ts: string; level: LogLevel; line: string };

export type LogFilter = {
  env: string;
  day: string;
  level: LogLevel | undefined;
  query: string | undefined;
  /** Today without a search: the follow view; anything else: a search of that day. */
  mode: "live" | "search";
};

const first = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;

/** A literal search text: trimmed, 1–200 characters, no control characters. */
export function cleanQuery(raw: string | undefined): string | undefined {
  const q = raw?.trim();
  if (!q || q.length > LOG_QUERY_MAX) return undefined;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: that is what is rejected
  return /[\u0000-\u001f\u007f-\u009f]/.test(q) ? undefined : q;
}

/** The "any level" option's value: a Select item cannot be "". `parseLogFilter` reads it (like any
 * value that is not a level) as no level filter. */
export const LEVEL_ALL = "all";

/** What `?env&day&level&q` mean, falling back to production / today when a value is not one of
 * the page's own options (a stale link must not reach the agent as an error). */
export function parseLogFilter(
  sp: Record<string, string | string[] | undefined>,
  sources: readonly { env: string }[],
  days: readonly string[],
): LogFilter {
  const envRaw = first(sp.env);
  const env =
    envRaw && LOG_ENV.test(envRaw) && sources.some((s) => s.env === envRaw)
      ? envRaw
      : "production";
  const dayRaw = first(sp.day);
  const today = days[0] ?? "";
  const day = dayRaw && days.includes(dayRaw) ? dayRaw : today;
  const levelRaw = first(sp.level);
  const level = LOG_LEVELS.find((l) => l === levelRaw);
  const query = cleanQuery(first(sp.q));
  return {
    env,
    day,
    level,
    query,
    mode: day === today && query === undefined ? "live" : "search",
  };
}

/** The viewer's time column: the entry's UTC clock, the same on the server and the browser. */
export function logTime(ts: string): string {
  return ts.slice(11, 19);
}

export function toLines(rows: readonly LogRow[]): LogLine[] {
  return rows.map((r) => ({
    time: logTime(r.ts),
    level: r.level,
    text: r.line,
  }));
}

/** The downloaded file: what is on screen, one line per entry, oldest first. */
export function logFileText(rows: readonly LogRow[]): string {
  return rows
    .map((r) => `${r.ts} ${r.level.toUpperCase().padEnd(5)} ${r.line}`)
    .join("\n")
    .concat(rows.length ? "\n" : "");
}

export function logFileName(
  project: string,
  f: Pick<LogFilter, "env" | "day">,
) {
  return `${project}-${f.env}-${f.day}.log`;
}

// ── Bases de datos ──

/** A backup older than this is a warning (kit-db runs nightly: a night missed shows up). */
export const BACKUP_FRESH_MS = 36 * 3_600_000;

export type BackupState =
  | { status: "ready" }
  | { status: "warning"; reason: string };

/** The `FAIL <date> <db>: <why>` lines that name this database (third field, with its colon). */
export function failuresOf(db: string, failures: readonly string[]): string[] {
  return failures.filter((f) => f.split(/\s+/)[2] === `${db}:`);
}

export function backupState(
  backup: { at: string | null } | null,
  failures: readonly string[],
  now: number,
): BackupState {
  if (failures.length > 0)
    return { status: "warning", reason: failures.join(" · ") };
  if (!backup)
    return { status: "warning", reason: "Aún no hay ningún backup." };
  const at = backup.at ? Date.parse(backup.at) : Number.NaN;
  if (Number.isNaN(at))
    return {
      status: "warning",
      reason: "No se pudo leer la fecha del último backup.",
    };
  if (now - at >= BACKUP_FRESH_MS)
    return { status: "warning", reason: "El último backup tiene más de 36 h." };
  return { status: "ready" };
}
