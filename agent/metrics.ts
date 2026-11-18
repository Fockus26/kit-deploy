/**
 * `metrics.sample` (D015, brief F9): one reading of the machine for `kit-deploy metrics collect`,
 * which stores it. The agent has no database; it only reads — `docker stats`, `/proc`, `df` and
 * Caddy's JSON access log — and keeps one small state file: where it stopped reading the log and
 * the counts of the minute still in progress.
 *
 * Requests are counted per host per minute and a minute is returned once, when it is over, so the
 * collector never adds the same minute twice. Every part is independent: a failing `docker stats`
 * still returns the VPS and the requests, with the reason in `errors`.
 */
import { z } from "zod";
import type { Deps } from "./deps";
import type { ManagedContainer } from "./ops";

/** Written by Caddy (`kit_access_log`, infra/server-ready.sh), rolled by Caddy at 50 MiB. */
export const ACCESS_LOG = "/var/log/caddy/access.log";
/** Root 0700: the only state the agent keeps for metrics. */
export const METRICS_DIR = "/var/lib/kit-deploy/metrics";
export const METRICS_STATE = `${METRICS_DIR}/access-log.json`;

const MINUTE_MS = 60_000;
/** A line is written when its request ends; a minute is closed this long after it ends. */
export const MINUTE_GRACE_MS = 5_000;
/** One sample reads at most this much of the log; the rest waits for the next (30 s later). */
export const MAX_LOG_READ = 8 * 1024 * 1024;
/** Hosts come from the Host header (anyone can send one to the preview wildcard): bounded. */
export const MAX_HOSTS = 1000;
/** A line dated further ahead than this is not believed. */
const MAX_FUTURE_MS = 5 * MINUTE_MS;
const PROC_READ = 256 * 1024;
const STATS_TIMEOUT_MS = 20_000;
const DF_TIMEOUT_MS = 10_000;

export type VpsSample = {
  memTotal: number;
  memUsed: number;
  diskTotal: number;
  diskUsed: number;
  load1: number;
  /** Online CPUs: the denominator for load, and for a container's CPU % (no `--cpus` is set). */
  cpus: number;
};

export type ContainerSample = {
  name: string;
  project: string;
  /** `production` or `pr-<n>`. */
  env: string;
  /** As Docker gives it: 100 per core, so above 100 on more than one core. */
  cpuPct: number;
  memBytes: number;
  /** The container's `--memory` (or the host's memory without one). */
  memLimitBytes: number;
};

export type RequestMinute = {
  host: string;
  /** ISO start of the minute (UTC). */
  minute: string;
  count: number;
  count5xx: number;
};

export type MetricsSample = {
  at: string;
  vps: VpsSample | null;
  containers: ContainerSample[];
  requests: RequestMinute[];
  /** What could not be read this time, one line each; the rest of the sample is still good. */
  errors: string[];
};

// ── Parsing (pure) ──────────────────────────────────────────────────────────────────────────

const UNITS: Record<string, number> = {
  b: 1,
  kb: 1e3,
  mb: 1e6,
  gb: 1e9,
  tb: 1e12,
  kib: 1024,
  mib: 1024 ** 2,
  gib: 1024 ** 3,
  tib: 1024 ** 4,
};

/** `12.3MiB`, `512MiB`, `1.5GB`, `0B` → bytes (rounded); null when it is not a size. */
export function parseBytes(text: string): number | null {
  const m = /^\s*([0-9]+(?:\.[0-9]+)?)\s*([A-Za-z]+)\s*$/.exec(text);
  if (!m) return null;
  const unit = UNITS[(m[2] ?? "").toLowerCase()];
  if (unit === undefined) return null;
  return Math.round(Number(m[1]) * unit);
}

/** `0.50%` → 0.5; null for `--` (a container that is starting or stopping). */
export function parsePercent(text: string): number | null {
  const m = /^\s*([0-9]+(?:\.[0-9]+)?)%\s*$/.exec(text);
  return m ? Number(m[1]) : null;
}

const statsLine = z.looseObject({
  Name: z.string(),
  CPUPerc: z.string(),
  MemUsage: z.string(),
});

/** `docker stats --no-stream --format '{{json .}}'`, one object per line, joined to the managed
 * containers by name: any other container on the VPS (gaby, evolution_*) is left out. */
export function parseDockerStats(
  stdout: string,
  managed: readonly ManagedContainer[],
): ContainerSample[] {
  const byName = new Map(managed.map((c) => [c.name, c]));
  const out: ContainerSample[] = [];
  for (const line of stdout.split("\n")) {
    if (line.trim() === "") continue;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      continue;
    }
    const s = statsLine.safeParse(raw);
    if (!s.success) continue;
    const c = byName.get(s.data.Name);
    const env = c ? containerEnv(c) : null;
    if (!c || !env) continue;
    const [used, limit] = s.data.MemUsage.split("/");
    const cpuPct = parsePercent(s.data.CPUPerc);
    const memBytes = parseBytes(used ?? "");
    const memLimitBytes = parseBytes(limit ?? "");
    if (cpuPct === null || memBytes === null || memLimitBytes === null)
      continue;
    out.push({
      name: c.name,
      project: c.project,
      env,
      cpuPct,
      memBytes,
      memLimitBytes,
    });
  }
  return out;
}

/** `production`, or `pr-<n>` from the site label (`<project>-pr-<n>`); null if the labels do not
 * agree with each other. */
export function containerEnv(c: ManagedContainer): string | null {
  if (c.env === "production") return c.site === c.project ? "production" : null;
  if (c.env !== "preview") return null;
  const m = /^(.+)-(pr-[1-9][0-9]{0,5})$/.exec(c.site);
  return m && m[1] === c.project ? (m[2] ?? null) : null;
}

/** `/proc/meminfo`: used = MemTotal − MemAvailable (what `free` calls used + buffers that count). */
export function parseMeminfo(text: string): {
  memTotal: number;
  memUsed: number;
} | null {
  const kb = (key: string) => {
    const m = new RegExp(`^${key}:\\s+([0-9]+) kB$`, "m").exec(text);
    return m ? Number(m[1]) * 1024 : null;
  };
  const total = kb("MemTotal");
  const available = kb("MemAvailable");
  if (total === null || available === null) return null;
  return { memTotal: total, memUsed: Math.max(0, total - available) };
}

export function parseLoadavg(text: string): number | null {
  const v = Number(text.trim().split(/\s+/)[0]);
  return Number.isFinite(v) && v >= 0 ? v : null;
}

/** Online CPUs from `/proc/stat` (`cpu0 …`, `cpu1 …`). */
export function parseCpuCount(text: string): number | null {
  const n = (text.match(/^cpu[0-9]+\s/gm) ?? []).length;
  return n > 0 ? n : null;
}

/** `df -B1 --output=size,used /`: a header, then `<size> <used>` in bytes. */
export function parseDf(stdout: string): {
  diskTotal: number;
  diskUsed: number;
} | null {
  const line = stdout.trim().split("\n")[1];
  const [size, used] = (line ?? "").trim().split(/\s+/).map(Number);
  if (!Number.isSafeInteger(size) || !Number.isSafeInteger(used)) return null;
  return { diskTotal: size as number, diskUsed: used as number };
}

// ── Access log ─────────────────────────────────────────────────────────────────────────────

const logState = z.strictObject({
  ino: z.number().int().min(0),
  offset: z.number().int().min(0),
  /** Minutes before this (ms) were already returned: a late line for one of them is dropped. */
  through: z.number().int().min(0),
  /** Counts still being added to: host → minute start (ms) → [requests, 5xx]. */
  pending: z.record(
    z.string().max(253),
    z.record(
      z.string().regex(/^[0-9]{1,15}$/),
      z.tuple([z.number().int().min(0), z.number().int().min(0)]),
    ),
  ),
});
export type LogState = z.infer<typeof logState>;

const EMPTY_STATE: LogState = { ino: 0, offset: 0, through: 0, pending: {} };

/** The saved state, or a fresh one (read the current file from its start) when it is missing or
 * unreadable: a minute returned twice is not counted twice, the collector keeps the first. */
export function parseLogState(text: string | null): LogState {
  if (text === null) return structuredClone(EMPTY_STATE);
  try {
    const s = logState.safeParse(JSON.parse(text));
    return s.success ? s.data : structuredClone(EMPTY_STATE);
  } catch {
    return structuredClone(EMPTY_STATE);
  }
}

const HOST_RE = /^[a-z0-9]([a-z0-9-]{0,62})(\.[a-z0-9]([a-z0-9-]{0,62}))*$/;

/** The request's host, lowercase, without a port; null when it is not a plausible DNS name. */
export function normaliseHost(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 260) return null;
  const host = raw.toLowerCase().replace(/:[0-9]{1,5}$/, "");
  return host.length <= 253 && HOST_RE.test(host) ? host : null;
}

const accessLine = z.looseObject({
  ts: z.number(),
  status: z.number().int(),
  request: z.looseObject({ host: z.unknown() }),
});

/** Adds the complete lines of `text` to `state.pending`. Returns how many lines were dropped
 * (not an access line, late, too far ahead, or one host over the limit). */
export function countLines(state: LogState, text: string, now: number): number {
  let dropped = 0;
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      dropped++;
      continue;
    }
    const l = accessLine.safeParse(raw);
    const host = l.success ? normaliseHost(l.data.request.host) : null;
    if (!l.success || host === null) {
      dropped++;
      continue;
    }
    const ms = l.data.ts * 1000;
    const minute = Math.floor(ms / MINUTE_MS) * MINUTE_MS;
    if (
      !Number.isFinite(ms) ||
      minute < state.through ||
      ms > now + MAX_FUTURE_MS
    ) {
      dropped++;
      continue;
    }
    let byMinute = state.pending[host];
    if (!byMinute) {
      if (Object.keys(state.pending).length >= MAX_HOSTS) {
        dropped++;
        continue;
      }
      byMinute = {};
      state.pending[host] = byMinute;
    }
    const cell = byMinute[String(minute)] ?? [0, 0];
    cell[0] += 1;
    if (l.data.status >= 500 && l.data.status <= 599) cell[1] += 1;
    byMinute[String(minute)] = cell;
  }
  return dropped;
}

/** Takes out of `state.pending` every minute that started before `cutoff` (ms), in order. */
export function closeMinutes(state: LogState, cutoff: number): RequestMinute[] {
  const out: RequestMinute[] = [];
  for (const [host, byMinute] of Object.entries(state.pending)) {
    for (const [key, [count, count5xx]] of Object.entries(byMinute)) {
      const minute = Number(key);
      if (minute >= cutoff) continue;
      out.push({
        host,
        minute: new Date(minute).toISOString(),
        count,
        count5xx,
      });
      delete byMinute[key];
    }
    if (Object.keys(byMinute).length === 0) delete state.pending[host];
  }
  state.through = Math.max(state.through, cutoff);
  return out.sort(
    (a, b) => a.minute.localeCompare(b.minute) || a.host.localeCompare(b.host),
  );
}

/** Reads what Caddy wrote since the last time and returns the minutes that are over. The file is
 * read again from its start when it was rolled (another inode, or shorter than the offset): the
 * lines the old file got after the last read are lost, at most 30 s of them. A line cut at the
 * end of the file is left for the next read. */
export async function readRequests(
  deps: Deps,
  now: number,
): Promise<{ requests: RequestMinute[]; dropped: number }> {
  const state = parseLogState(await deps.readFile(METRICS_STATE));
  const head = await deps.readFileFrom(ACCESS_LOG, 0, 0);
  if (head === null) {
    // No log yet (no site has had a request): nothing to count, nothing to save.
    return { requests: [], dropped: 0 };
  }
  if (head.ino !== state.ino || head.size < state.offset) {
    state.ino = head.ino;
    state.offset = 0;
  }
  const chunk = await deps.readFileFrom(ACCESS_LOG, state.offset, MAX_LOG_READ);
  let dropped = 0;
  let atEnd = true;
  let lastMinute: number | null = null;
  if (chunk !== null && chunk.ino === state.ino && chunk.data.length > 0) {
    const buf = Buffer.from(chunk.data);
    const end = buf.lastIndexOf(0x0a);
    // A whole read with no newline is not a line Caddy wrote: skip it rather than stay stuck.
    const used =
      end === -1 ? (buf.length >= MAX_LOG_READ ? buf.length : 0) : end + 1;
    const text = end === -1 ? "" : buf.subarray(0, end).toString("utf8");
    dropped = countLines(state, text, now);
    state.offset += used;
    atEnd = state.offset >= chunk.size;
    if (!atEnd) lastMinute = lastLineMinute(text);
  }
  let cutoff = Math.floor((now - MINUTE_GRACE_MS) / MINUTE_MS) * MINUTE_MS;
  // Mid-file the clock says nothing about what is still unread: only minutes before the last
  // line read are known to be complete.
  if (!atEnd) cutoff = Math.min(cutoff, lastMinute ?? state.through);
  const requests = closeMinutes(state, cutoff);
  await deps.writePrivateFile(METRICS_STATE, JSON.stringify(state));
  return { requests, dropped };
}

function lastLineMinute(text: string): number | null {
  const i = text.lastIndexOf("\n");
  try {
    const ts = (JSON.parse(text.slice(i + 1)) as { ts?: unknown }).ts;
    return typeof ts === "number"
      ? Math.floor((ts * 1000) / MINUTE_MS) * MINUTE_MS
      : null;
  } catch {
    return null;
  }
}

// ── The operation ───────────────────────────────────────────────────────────────────────────

async function procText(deps: Deps, path: string): Promise<string> {
  const r = await deps.readFileFrom(path, 0, PROC_READ);
  if (r === null) throw new Error(`${path} is missing`);
  return Buffer.from(r.data).toString("utf8");
}

async function readVps(deps: Deps): Promise<VpsSample> {
  const mem = parseMeminfo(await procText(deps, "/proc/meminfo"));
  const load1 = parseLoadavg(await procText(deps, "/proc/loadavg"));
  const cpus = parseCpuCount(await procText(deps, "/proc/stat"));
  const r = await deps.run(["df", "-B1", "--output=size,used", "/"], {
    timeoutMs: DF_TIMEOUT_MS,
  });
  const disk = r.code === 0 ? parseDf(r.stdout) : null;
  if (!mem || load1 === null || cpus === null || !disk)
    throw new Error("cannot read memory, load, CPUs or disk");
  return { ...mem, ...disk, load1, cpus };
}

async function readContainers(
  deps: Deps,
  listManaged: () => Promise<ManagedContainer[]>,
): Promise<ContainerSample[]> {
  const managed = (await listManaged()).filter((c) => c.state === "running");
  if (managed.length === 0) return [];
  // Every running container, joined by name afterwards: naming them would fail the whole call
  // when one stops between the list and the stats.
  const r = await deps.run(
    ["docker", "stats", "--no-stream", "--format={{json .}}"],
    { timeoutMs: STATS_TIMEOUT_MS },
  );
  if (r.code !== 0) throw new Error(`docker stats failed (exit ${r.code})`);
  return parseDockerStats(r.stdout, managed);
}

/** The reason, short and without paths' contents: it goes back to the caller. */
function reason(what: string, e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return `${what}: ${msg.slice(0, 200)}`;
}

/** One sample at a time per agent: two at once would read the same lines and both save state. */
const running = new WeakMap<Deps, Promise<unknown>>();

export function sampleMetrics(
  deps: Deps,
  now: () => number,
  listManaged: () => Promise<ManagedContainer[]>,
): Promise<MetricsSample> {
  const prev = running.get(deps) ?? Promise.resolve();
  const next = prev.then(
    () => sampleOnce(deps, now, listManaged),
    () => sampleOnce(deps, now, listManaged),
  );
  running.set(
    deps,
    next.catch(() => undefined),
  );
  return next;
}

async function sampleOnce(
  deps: Deps,
  now: () => number,
  listManaged: () => Promise<ManagedContainer[]>,
): Promise<MetricsSample> {
  const at = now();
  const errors: string[] = [];
  const [vps, containers] = await Promise.all([
    readVps(deps).catch((e) => {
      errors.push(reason("vps", e));
      return null;
    }),
    readContainers(deps, listManaged).catch((e) => {
      errors.push(reason("containers", e));
      return [];
    }),
  ]);
  let requests: RequestMinute[] = [];
  try {
    const r = await readRequests(deps, now());
    requests = r.requests;
    if (r.dropped > 0)
      deps.log({ op: "metrics.sample", droppedLines: r.dropped });
  } catch (e) {
    errors.push(reason("requests", e));
  }
  return { at: new Date(at).toISOString(), vps, containers, requests, errors };
}
