/**
 * Runtime logs (D014, brief F8). kit-agent follows the output of every running managed container
 * into `/var/lib/kit-deploy/logs/<project>/<YYYY-MM-DD>.log` (UTC, one JSON object per line), gzips
 * a day once it is over and removes it after 14 days. `logs.tail` and `logs.search` read those
 * files; nothing else does (the web app asks the agent, D011).
 *
 * The follower and the readers do their I/O only through `LogDeps` (real one in `logs-system.ts`),
 * so rotation, resume and the bounds are tested with fakes and a fake clock.
 */
import { posix } from "node:path";
import { CoreInputError } from "../lib/core/validate";
import { type ManagedContainer, scrubUrls } from "./ops";

export const LOGS_ROOT = "/var/lib/kit-deploy/logs";
/** Today plus the 13 days before it. */
export const RETENTION_DAYS = 14;
/** A longer line is cut: one runaway line must not fill a response or the day's file. */
export const MAX_LINE_CHARS = 16 * 1024;
/** Per project and day (D025): past it the day's lines are dropped, with one line saying so. */
export const MAX_DAY_BYTES = 50 * 1024 * 1024;
/** What one `logs.tail` / `logs.search` answer may carry, whatever `lines` / `limit` say. */
export const MAX_RESULT_BYTES = 512 * 1024;
/** `logs.tail` reads at most this much of the end of today's file. */
export const TAIL_READ_BYTES = 4 * 1024 * 1024;
export const RECONCILE_MS = 10_000;
export const FLUSH_MS = 1_000;
/** A project's buffered lines are written early when they reach this. */
const FLUSH_BYTES = 256 * 1024;
export const DEFAULT_TAIL_LINES = 100;
export const DEFAULT_SEARCH_LIMIT = 200;

const PROJECT = /^[a-z0-9][a-z0-9_]{0,39}$/;
const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.log(\.gz)?$/;
/** The same shape `containerNameSchema` accepts: a Docker label alone never names a log file. */
const CONTAINER =
  /^[a-z0-9][a-z0-9_]{0,39}-(?:prod|pr-[1-9][0-9]{0,5})-[0-9a-f]{7,12}(?:-g[2-9]|-g[1-9][0-9]{1,3})?$/;

export type Stream = "stdout" | "stderr";
export type Level = "error" | "warn" | "info";
/** One line as stored. `env` is `production` or `pr-<n>`; `ts` is RFC 3339 UTC with 9 decimals,
 * so two of them compare as strings. */
export type LogRecord = {
  ts: string;
  container: string;
  env: string;
  stream: Stream;
  line: string;
};
export type LogEntry = LogRecord & { level: Level };

export interface LogDeps {
  /** Follows a container's stdout and stderr from `since` (Docker's `<unix s>.<ns>`) until it
   * stops or `signal` aborts. Each line comes whole, still prefixed with Docker's timestamp. */
  follow(
    container: string,
    since: string,
    onLine: (stream: Stream, raw: string) => void,
    signal: AbortSignal,
  ): Promise<void>;
  /** Appends to the file, created 0600 in directories made 0700. */
  append(path: string, text: string): Promise<void>;
  /** 0 when the file does not exist. */
  size(path: string): Promise<number>;
  /** The file's lines in order, gunzipped when it ends in `.gz`; nothing when it is missing. */
  lines(path: string): AsyncIterable<string>;
  /** The last `maxBytes` of a plain file; `whole` when that was all of it. null when missing. */
  readTail(
    path: string,
    maxBytes: number,
  ): Promise<{ text: string; whole: boolean } | null>;
  /** Names directly in `dir` of that kind (no symlinks); [] when `dir` does not exist. */
  list(dir: string, kind: "file" | "dir"): Promise<string[]>;
  /** `<path>` → `<path>.gz`, then removes `<path>`. */
  gzip(path: string): Promise<void>;
  /** No error when it is already gone. */
  remove(path: string): Promise<void>;
}

// ── Days and timestamps ──

export function dayOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  return dayOf(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000);
}

const TS = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/;

/** Docker's RFC3339Nano (trailing zeros trimmed) → always 9 decimals. null when it is not one. */
export function normalizeTs(ts: string): string | null {
  const m = TS.exec(ts);
  if (!m || Number.isNaN(Date.parse(`${m[1]}Z`))) return null;
  return `${m[1]}.${(m[2] ?? "").padEnd(9, "0")}Z`;
}

/** A normalized timestamp as Docker's `since`: `<unix seconds>.<nanoseconds>`. */
export function sinceArg(ts: string): string {
  const m = TS.exec(ts);
  if (!m) throw new Error(`not a timestamp: ${ts}`);
  return `${Date.parse(`${m[1]}Z`) / 1000}.${(m[2] ?? "").padEnd(9, "0")}`;
}

/** `2026-11-17T10:00:00.5Z hello` → its timestamp and text. A line without one gets `fallback`. */
export function splitTimestamp(
  raw: string,
  fallback: string,
): { ts: string; text: string } {
  const sp = raw.indexOf(" ");
  const ts = normalizeTs(sp === -1 ? raw : raw.slice(0, sp));
  if (ts === null) return { ts: fallback, text: raw };
  return { ts, text: sp === -1 ? "" : raw.slice(sp + 1) };
}

// ── Paths: only `<root>/<project>/<day>.log[.gz]` ──

export function projectDir(project: string): string {
  if (!PROJECT.test(project))
    throw new CoreInputError(`invalid project name "${project}"`);
  const dir = posix.join(LOGS_ROOT, project);
  // Second check after the regex: the result is one directory directly under the root.
  if (posix.dirname(dir) !== LOGS_ROOT)
    throw new CoreInputError(`invalid project name "${project}"`);
  return dir;
}

export function logPath(project: string, day: string, gz = false): string {
  const name = `${day}.log${gz ? ".gz" : ""}`;
  if (!DAY_FILE.test(name)) throw new CoreInputError(`invalid day "${day}"`);
  const path = posix.join(projectDir(project), name);
  if (posix.dirname(path) !== posix.join(LOGS_ROOT, project))
    throw new CoreInputError(`invalid day "${day}"`);
  return path;
}

// ── Lines ──

export function capLine(text: string): string {
  return text.length > MAX_LINE_CHARS
    ? `${text.slice(0, MAX_LINE_CHARS)}…[cut]`
    : text;
}

/** `production`, `pr-<n>`, or null for a container that is neither. */
export function logEnv(c: ManagedContainer): string | null {
  if (c.env === "production") return "production";
  if (c.env !== "preview") return null;
  const m = /-pr-([1-9][0-9]{0,5})$/.exec(c.site);
  return m ? `pr-${m[1]}` : null;
}

const ERROR_WORDS = /\b(?:error|fatal|panic|exception|uncaught|unhandled)\b/i;
const WARN_WORDS = /\bwarn(?:ing)?\b/i;

function levelFromField(v: unknown): Level | null {
  if (typeof v === "number")
    return v >= 50 ? "error" : v >= 40 ? "warn" : "info";
  if (typeof v !== "string") return null;
  if (/^(?:error|err|fatal|panic|critical|crit|emerg|alert)$/i.test(v))
    return "error";
  if (/^(?:warn|warning)$/i.test(v)) return "warn";
  return "info";
}

/** A JSON line's own `level` (pino's numbers too); else by words in the text. */
export function levelOf(line: string): Level {
  const t = line.trimStart();
  if (t.startsWith("{")) {
    try {
      const o = JSON.parse(t) as Record<string, unknown>;
      const l = levelFromField(o.level ?? o.severity);
      if (l) return l;
    } catch {
      // Not JSON after all: the words decide.
    }
  }
  if (ERROR_WORDS.test(line)) return "error";
  if (WARN_WORDS.test(line)) return "warn";
  return "info";
}

export function parseRecord(text: string): LogRecord | null {
  if (text === "") return null;
  try {
    const o = JSON.parse(text) as Partial<LogRecord>;
    if (
      typeof o.ts === "string" &&
      typeof o.container === "string" &&
      typeof o.env === "string" &&
      (o.stream === "stdout" || o.stream === "stderr") &&
      typeof o.line === "string"
    ) {
      return {
        ts: o.ts,
        container: o.container,
        env: o.env,
        stream: o.stream,
        line: o.line,
      };
    }
  } catch {
    // A torn last line (power cut mid-append) is skipped.
  }
  return null;
}

const entryBytes = (e: LogEntry) => JSON.stringify(e).length;

// ── The follower ──

type Followed = { abort: AbortController; project: string; env: string };

export class LogFollower {
  private readonly active = new Map<string, Followed>();
  /** Container → timestamp of the last line taken. */
  private readonly cursors = new Map<string, string>();
  private readonly loaded = new Set<string>();
  private readonly pending = new Map<string, string[]>();
  private readonly pendingBytes = new Map<string, number>();
  private readonly written = new Map<
    string,
    { day: string; bytes: number; capped: boolean }
  >();
  private writing: Promise<void> = Promise.resolve();
  private rotatedDay: string | null = null;
  private reconciling = false;
  private timers: ReturnType<typeof setInterval>[] = [];

  constructor(
    private readonly deps: LogDeps,
    private readonly listRunning: () => Promise<ManagedContainer[]>,
    private readonly log: (event: Record<string, unknown>) => void,
    private readonly now: () => number = Date.now,
  ) {}

  start(): void {
    void this.reconcile();
    this.timers.push(
      setInterval(() => void this.reconcile(), RECONCILE_MS),
      setInterval(() => void this.flush(), FLUSH_MS),
    );
  }

  async stop(): Promise<void> {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    for (const f of this.active.values()) f.abort.abort();
    this.active.clear();
    await this.flush();
  }

  /** Containers being followed now (tests, journal). */
  following(): string[] {
    return [...this.active.keys()].sort();
  }

  /** Rotates once per day, then follows what runs and drops what no longer does. */
  async reconcile(): Promise<void> {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      if (this.rotatedDay !== dayOf(this.now())) await this.rotate();
      let running: ManagedContainer[];
      try {
        running = await this.listRunning();
      } catch (e) {
        this.log({ event: "logs.list_failed", error: String(e) });
        return;
      }
      const want = new Map<string, { project: string; env: string }>();
      for (const c of running) {
        const env = logEnv(c);
        if (
          c.state !== "running" ||
          env === null ||
          !PROJECT.test(c.project) ||
          !CONTAINER.test(c.name) ||
          !c.name.startsWith(`${c.project}-`)
        )
          continue;
        want.set(c.name, { project: c.project, env });
      }
      for (const [name, f] of this.active) {
        if (!want.has(name)) {
          f.abort.abort();
          this.active.delete(name);
        }
      }
      for (const [name, t] of want) {
        if (!this.active.has(name)) await this.follow(name, t.project, t.env);
      }
    } finally {
      this.reconciling = false;
    }
  }

  private async follow(
    name: string,
    project: string,
    env: string,
  ): Promise<void> {
    await this.loadCursors(project);
    const resumeFrom = this.cursors.get(name) ?? null;
    // A container never seen: from the start of today (a new deploy's first lines included).
    const since = resumeFrom ?? `${dayOf(this.now())}T00:00:00.000000000Z`;
    const abort = new AbortController();
    this.active.set(name, { abort, project, env });
    const onLine = (stream: Stream, raw: string) => {
      const { ts, text } = splitTimestamp(raw, this.nowTs());
      // Docker's `since` is inclusive: the last line already written comes again.
      if (resumeFrom !== null && ts <= resumeFrom) return;
      this.cursors.set(name, ts);
      const rec: LogRecord = {
        ts,
        container: name,
        env,
        stream,
        line: capLine(scrubUrls(text)),
      };
      this.queue(project, JSON.stringify(rec));
    };
    void this.deps
      .follow(name, sinceArg(since), onLine, abort.signal)
      .catch((e) => {
        if (!abort.signal.aborted)
          this.log({
            event: "logs.follow_failed",
            container: name,
            error: String(e),
          });
      })
      .finally(() => {
        // Stopped or restarted: the next reconcile follows it again from its cursor.
        if (this.active.get(name)?.abort === abort) this.active.delete(name);
      });
  }

  private nowTs(): string {
    return normalizeTs(new Date(this.now()).toISOString()) ?? "";
  }

  private queue(project: string, line: string): void {
    const list = this.pending.get(project) ?? [];
    list.push(line);
    this.pending.set(project, list);
    const bytes = (this.pendingBytes.get(project) ?? 0) + line.length + 1;
    this.pendingBytes.set(project, bytes);
    if (bytes >= FLUSH_BYTES) void this.flush();
  }

  /** Writes what is buffered, one append per project. Serialized with rotation. */
  flush(): Promise<void> {
    this.writing = this.writing
      .then(() => this.writePending())
      .catch((e) => this.log({ event: "logs.write_failed", error: String(e) }));
    return this.writing;
  }

  private async writePending(): Promise<void> {
    const day = dayOf(this.now());
    const batches = [...this.pending];
    this.pending.clear();
    this.pendingBytes.clear();
    for (const [project, lines] of batches) {
      const path = logPath(project, day);
      let w = this.written.get(project);
      if (!w || w.day !== day) {
        const bytes = await this.deps.size(path);
        w = { day, bytes, capped: bytes >= MAX_DAY_BYTES };
        this.written.set(project, w);
      }
      if (w.capped) continue;
      let text = "";
      let bytes = 0;
      for (const line of lines) {
        const b = Buffer.byteLength(line) + 1;
        if (w.bytes + bytes + b > MAX_DAY_BYTES) {
          const marker: LogRecord = {
            ts: this.nowTs(),
            container: "kit-agent",
            env: "-",
            stream: "stderr",
            line: `warning: ${project} reached ${MAX_DAY_BYTES / 1024 / 1024} MiB of logs for ${day}; later lines of the day are dropped`,
          };
          const m = `${JSON.stringify(marker)}\n`;
          text += m;
          bytes += Buffer.byteLength(m);
          w.capped = true;
          this.log({ event: "logs.day_capped", project, day });
          break;
        }
        text += `${line}\n`;
        bytes += b;
      }
      if (text === "") continue;
      await this.deps.append(path, text);
      w.bytes += bytes;
    }
  }

  /** Cursors from yesterday's and today's files, so a restart neither repeats nor skips lines. */
  private async loadCursors(project: string): Promise<void> {
    if (this.loaded.has(project)) return;
    this.loaded.add(project);
    const today = dayOf(this.now());
    for (const day of [addDays(today, -1), today]) {
      for (const path of await dayFiles(this.deps, project, day)) {
        for await (const text of this.deps.lines(path)) {
          const r = parseRecord(text);
          if (!r) continue;
          const prev = this.cursors.get(r.container);
          if (prev === undefined || r.ts > prev)
            this.cursors.set(r.container, r.ts);
        }
      }
    }
  }

  /** Days before today gzipped; days older than the retention removed. */
  rotate(): Promise<void> {
    const today = dayOf(this.now());
    this.writing = this.writing
      .then(async () => {
        const oldest = addDays(today, -(RETENTION_DAYS - 1));
        for (const project of await this.deps.list(LOGS_ROOT, "dir")) {
          if (!PROJECT.test(project)) continue;
          const dir = projectDir(project);
          for (const name of await this.deps.list(dir, "file")) {
            const m = DAY_FILE.exec(name);
            const day = m?.[1];
            if (!day) continue;
            if (day < oldest) await this.deps.remove(posix.join(dir, name));
            else if (!m[2] && day < today)
              await this.deps.gzip(posix.join(dir, name));
          }
        }
        this.rotatedDay = today;
      })
      .catch((e) =>
        this.log({ event: "logs.rotate_failed", error: String(e) }),
      );
    return this.writing;
  }
}

// ── Reading: logs.tail and logs.search ──

/** A day's files in the order their lines were written: the gzipped part, then the plain one. */
async function dayFiles(
  deps: LogDeps,
  project: string,
  day: string,
): Promise<string[]> {
  const names = new Set(await deps.list(projectDir(project), "file"));
  return [true, false]
    .filter((gz) => names.has(`${day}.log${gz ? ".gz" : ""}`))
    .map((gz) => logPath(project, day, gz));
}

export type LogFilter = { env?: string; level?: Level; query?: string };

function matcher(f: LogFilter): (r: LogRecord) => LogEntry | null {
  // A literal, case-insensitive substring: no pattern from the client ever reaches a RegExp.
  const q = f.query?.toLowerCase();
  return (r) => {
    if (f.env !== undefined && r.env !== f.env) return null;
    if (q !== undefined && !r.line.toLowerCase().includes(q)) return null;
    const e = { ...r, level: levelOf(r.line) };
    if (f.level !== undefined && e.level !== f.level) return null;
    return e;
  };
}

/** Keeps the newest that fit `max` bytes; returns them oldest first. */
function newestWithin(entries: LogEntry[], max: number): LogEntry[] {
  const out: LogEntry[] = [];
  let bytes = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i] as LogEntry;
    bytes += entryBytes(e);
    if (bytes > max && out.length > 0) break;
    out.push(e);
  }
  return out.reverse();
}

/** The last `lines` lines of a project (today, and yesterday when today has fewer), oldest first. */
export async function tailLogs(
  deps: LogDeps,
  p: { project: string; env?: string; level?: Level; lines?: number },
  nowMs: number,
): Promise<{ entries: LogEntry[] }> {
  const n = p.lines ?? DEFAULT_TAIL_LINES;
  const match = matcher(p);
  const today = dayOf(nowMs);
  const got: LogEntry[] = [];
  const tail = await deps.readTail(logPath(p.project, today), TAIL_READ_BYTES);
  if (tail) {
    const texts = tail.text.split("\n");
    // Cut mid-file: the first piece is the end of a line, not a line.
    if (!tail.whole) texts.shift();
    for (const t of texts) {
      const r = parseRecord(t);
      const e = r && match(r);
      if (e) got.push(e);
    }
  }
  if (got.length < n && (tail === null || tail.whole)) {
    const older: LogEntry[] = [];
    for (const path of await dayFiles(deps, p.project, addDays(today, -1))) {
      for await (const t of deps.lines(path)) {
        const r = parseRecord(t);
        const e = r && match(r);
        if (!e) continue;
        older.push(e);
        if (older.length > n) older.shift();
      }
    }
    got.unshift(...older);
  }
  return { entries: newestWithin(got.slice(-n), MAX_RESULT_BYTES) };
}

/**
 * A day's matching lines, newest first. `next` is the cursor for the page before (pass it as
 * `before`); null when nothing older matches.
 */
export async function searchLogs(
  deps: LogDeps,
  p: {
    project: string;
    day: string;
    query?: string;
    env?: string;
    level?: Level;
    limit?: number;
    before?: number;
  },
  nowMs: number,
): Promise<{ day: string; entries: LogEntry[]; next: number | null }> {
  const today = dayOf(nowMs);
  const oldest = addDays(today, -(RETENTION_DAYS - 1));
  if (normalizeTs(`${p.day}T00:00:00Z`) === null || addDays(p.day, 0) !== p.day)
    throw new CoreInputError(`invalid day "${p.day}"`);
  if (p.day < oldest || p.day > today)
    throw new CoreInputError(
      `day ${p.day} is outside the kept logs (${oldest} to ${today})`,
    );
  const limit = p.limit ?? DEFAULT_SEARCH_LIMIT;
  const before = p.before ?? Number.POSITIVE_INFINITY;
  const match = matcher(p);
  const ring: { no: number; e: LogEntry }[] = [];
  let matched = 0;
  let no = 0;
  scan: for (const path of await dayFiles(deps, p.project, p.day)) {
    for await (const t of deps.lines(path)) {
      const here = no++;
      if (here >= before) break scan;
      const r = parseRecord(t);
      const e = r && match(r);
      if (!e) continue;
      matched++;
      ring.push({ no: here, e });
      if (ring.length > limit) ring.shift();
    }
  }
  const entries: LogEntry[] = [];
  let bytes = 0;
  let oldestNo: number | null = null;
  for (let i = ring.length - 1; i >= 0; i--) {
    const { no: n, e } = ring[i] as { no: number; e: LogEntry };
    bytes += entryBytes(e);
    if (bytes > MAX_RESULT_BYTES && entries.length > 0) break;
    entries.push(e);
    oldestNo = n;
  }
  return {
    day: p.day,
    entries,
    next: matched > entries.length ? oldestNo : null,
  };
}
