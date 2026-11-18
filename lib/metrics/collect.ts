/**
 * `kit-deploy metrics collect` (D015): one `metrics.sample` from kit-agent into `metric_samples`.
 * Pure over a `MetricsStore`, so the merging, the rollups and the pruning are tested with a fake
 * clock and an in-memory store; the SQL behind the real one only reads, upserts and deletes.
 *
 * Idempotent: a reading merges into its minute (an average over `samples`), and a request minute
 * is written only when that minute has no requests stored yet — the same minute coming back
 * (a replayed sample, a log read again after a reset) is never counted twice.
 */
import type { ContainerSample, MetricsSample } from "../../agent/metrics";
import { PREVIEW_DOMAIN } from "../core/constants";
import type { MetricResolution, MetricScope } from "../db/schema";

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
/** D015: 1-minute rows for 48 h, 1-hour rows for 30 days. */
export const KEEP_MINUTES_MS = 48 * HOUR_MS;
export const KEEP_HOURS_MS = 30 * 24 * HOUR_MS;

export type MetricRow = {
  scope: MetricScope;
  subject: string;
  project: string | null;
  environment: string | null;
  resolution: MetricResolution;
  bucket: Date;
  samples: number;
  cpuPct: number | null;
  memBytes: number | null;
  memLimitBytes: number | null;
  diskBytes: number | null;
  diskTotalBytes: number | null;
  load1: number | null;
  cpus: number | null;
  requests: number | null;
  requests5xx: number | null;
};

export interface MetricsStore {
  /** Every production host (`domains`) with its project, and every project's name (previews). */
  hosts(): Promise<{
    domains: { host: string; project: string }[];
    projects: string[];
  }>;
  /** Rows of one resolution with `from <= bucket < to`. */
  rows(
    resolution: MetricResolution,
    from: Date,
    to: Date,
  ): Promise<MetricRow[]>;
  /** Insert, or replace the row with the same (scope, subject, resolution, bucket). */
  put(rows: MetricRow[]): Promise<void>;
  /** Removes the rows of one resolution older than `before`; how many. */
  prune(resolution: MetricResolution, before: Date): Promise<number>;
  /** The newest bucket of a resolution, or null when there is none. */
  latest(resolution: MetricResolution): Promise<Date | null>;
}

export type CollectReport = {
  at: string;
  vps: boolean;
  containers: number;
  requestMinutes: number;
  /** Minutes that already had their requests: not added again. */
  skippedMinutes: number;
  /** Hosts in the log that are no project's (db.fockus.dev, a removed domain, a scan). */
  unmappedHosts: number;
  hoursRolled: number;
  pruned: { minutes: number; hours: number };
  errors: string[];
};

export const keyOf = (
  r: Pick<MetricRow, "scope" | "subject" | "resolution" | "bucket">,
) => `${r.scope}|${r.subject}|${r.resolution}|${r.bucket.getTime()}`;

const floorTo = (ms: number, step: number) => Math.floor(ms / step) * step;

const empty = (
  scope: MetricScope,
  subject: string,
  project: string | null,
  environment: string | null,
  resolution: MetricResolution,
  bucket: Date,
): MetricRow => ({
  scope,
  subject,
  project,
  environment,
  resolution,
  bucket,
  samples: 1,
  cpuPct: null,
  memBytes: null,
  memLimitBytes: null,
  diskBytes: null,
  diskTotalBytes: null,
  load1: null,
  cpus: null,
  requests: null,
  requests5xx: null,
});

/** The running average of `old` (over `n` readings) with one more value. */
function avg(
  old: number | null,
  n: number,
  value: number | null,
): number | null {
  if (value === null) return old;
  if (old === null) return value;
  return (old * n + value) / (n + 1);
}

const round = (v: number | null) => (v === null ? null : Math.round(v));

/** A new reading of a gauge row merged into the stored one of the same minute: CPU, memory and
 * load averaged; the limit, disk and CPUs are the latest. */
export function mergeReading(
  old: MetricRow | undefined,
  next: MetricRow,
): MetricRow {
  if (!old) return next;
  const n = old.samples;
  return {
    ...old,
    samples: n + 1,
    cpuPct: avg(old.cpuPct, n, next.cpuPct),
    memBytes: round(avg(old.memBytes, n, next.memBytes)),
    load1: avg(old.load1, n, next.load1),
    memLimitBytes: next.memLimitBytes ?? old.memLimitBytes,
    diskBytes: next.diskBytes ?? old.diskBytes,
    diskTotalBytes: next.diskTotalBytes ?? old.diskTotalBytes,
    cpus: next.cpus ?? old.cpus,
  };
}

export type HostTarget = { project: string; env: string };

const PREVIEW_HOST = new RegExp(
  `^([a-z0-9-]+)-pr-([1-9][0-9]{0,5})\\.${PREVIEW_DOMAIN.replaceAll(".", "\\.")}$`,
);

/** Host → the project and environment it serves: a production domain, or a PR's preview host
 * (`<project with - for _>-pr-<n>.preview.fockus.dev`, D001). */
export function hostResolver(
  hosts: Awaited<ReturnType<MetricsStore["hosts"]>>,
) {
  const domains = new Map(
    hosts.domains.map((d) => [d.host.toLowerCase(), d.project]),
  );
  const byLabel = new Map(hosts.projects.map((p) => [p.replace(/_/g, "-"), p]));
  return (host: string): HostTarget | null => {
    const prod = domains.get(host);
    if (prod) return { project: prod, env: "production" };
    const m = PREVIEW_HOST.exec(host);
    const project = m ? byLabel.get(m[1] ?? "") : undefined;
    return project ? { project, env: `pr-${m?.[2]}` } : null;
  };
}

function containerRow(c: ContainerSample, bucket: Date): MetricRow {
  return {
    ...empty("container", c.name, c.project, c.env, "1m", bucket),
    cpuPct: c.cpuPct,
    memBytes: c.memBytes,
    memLimitBytes: c.memLimitBytes,
  };
}

/** The 1-hour row of a group of 1-minute rows of one subject: averages weighted by readings,
 * requests summed, the last disk reading, the largest limit. */
export function rollup(minutes: MetricRow[], hour: Date): MetricRow {
  const first = minutes[0];
  if (!first) throw new Error("rollup of no rows");
  const sorted = [...minutes].sort(
    (a, b) => a.bucket.getTime() - b.bucket.getTime(),
  );
  const weighted = (pick: (r: MetricRow) => number | null) => {
    let sum = 0;
    let n = 0;
    for (const r of sorted) {
      const v = pick(r);
      if (v === null) continue;
      sum += v * r.samples;
      n += r.samples;
    }
    return n === 0 ? null : sum / n;
  };
  const max = (pick: (r: MetricRow) => number | null) => {
    const vs = sorted.map(pick).filter((v): v is number => v !== null);
    return vs.length ? Math.max(...vs) : null;
  };
  const last = (pick: (r: MetricRow) => number | null) => {
    for (let i = sorted.length - 1; i >= 0; i--) {
      const v = pick(sorted[i] as MetricRow);
      if (v !== null) return v;
    }
    return null;
  };
  const sum = (pick: (r: MetricRow) => number | null) => {
    const vs = sorted.map(pick).filter((v): v is number => v !== null);
    return vs.length ? vs.reduce((a, b) => a + b, 0) : null;
  };
  return {
    ...empty(
      first.scope,
      first.subject,
      first.project,
      first.environment,
      "1h",
      hour,
    ),
    samples: sorted.reduce((a, r) => a + r.samples, 0),
    cpuPct: weighted((r) => r.cpuPct),
    memBytes: round(weighted((r) => r.memBytes)),
    memLimitBytes: max((r) => r.memLimitBytes),
    diskBytes: last((r) => r.diskBytes),
    diskTotalBytes: last((r) => r.diskTotalBytes),
    load1: weighted((r) => r.load1),
    cpus: max((r) => r.cpus),
    requests: sum((r) => r.requests),
    requests5xx: sum((r) => r.requests5xx),
  };
}

/** Every 1-hour row recomputed from the 1-minute rows of `[from, to)`, replacing what was there:
 * running it twice gives the same rows. */
export function rollupHours(minutes: MetricRow[]): MetricRow[] {
  const groups = new Map<string, { hour: Date; rows: MetricRow[] }>();
  for (const r of minutes) {
    const hour = new Date(floorTo(r.bucket.getTime(), HOUR_MS));
    const k = `${r.scope}|${r.subject}|${hour.getTime()}`;
    const g = groups.get(k) ?? { hour, rows: [] };
    g.rows.push(r);
    groups.set(k, g);
  }
  return [...groups.values()].map((g) => rollup(g.rows, g.hour));
}

export async function collectMetrics(
  sample: MetricsSample,
  store: MetricsStore,
  now: number,
): Promise<CollectReport> {
  const report: CollectReport = {
    at: sample.at,
    vps: false,
    containers: 0,
    requestMinutes: 0,
    skippedMinutes: 0,
    unmappedHosts: 0,
    hoursRolled: 0,
    pruned: { minutes: 0, hours: 0 },
    errors: [...sample.errors],
  };
  const minute = new Date(floorTo(Date.parse(sample.at), MINUTE_MS));
  const touched: number[] = [minute.getTime()];

  // Gauges: this reading merged into its minute.
  const gauges: MetricRow[] = sample.containers.map((c) =>
    containerRow(c, minute),
  );
  if (sample.vps) {
    gauges.push({
      ...empty("vps", "vps", null, null, "1m", minute),
      memBytes: sample.vps.memUsed,
      memLimitBytes: sample.vps.memTotal,
      diskBytes: sample.vps.diskUsed,
      diskTotalBytes: sample.vps.diskTotal,
      load1: sample.vps.load1,
      cpus: sample.vps.cpus,
    });
  }
  const write = new Map<string, MetricRow>();
  if (gauges.length > 0) {
    const stored = new Map(
      (
        await store.rows("1m", minute, new Date(minute.getTime() + MINUTE_MS))
      ).map((r) => [keyOf(r), r]),
    );
    for (const g of gauges)
      write.set(keyOf(g), mergeReading(stored.get(keyOf(g)), g));
    report.vps = sample.vps !== null;
    report.containers = sample.containers.length;
  }

  // Requests: every host of a project's environment added into one row per minute.
  const resolve = hostResolver(await store.hosts());
  const perMinute = new Map<string, MetricRow>();
  const unmapped = new Set<string>();
  for (const r of sample.requests) {
    const t = resolve(r.host);
    if (!t) {
      unmapped.add(r.host);
      continue;
    }
    const bucket = new Date(floorTo(Date.parse(r.minute), MINUTE_MS));
    // A backlog older than what 1-minute rows keep would be pruned in this same run.
    if (bucket.getTime() < now - KEEP_MINUTES_MS) continue;
    const row = empty(
      "requests",
      `${t.project}/${t.env}`,
      t.project,
      t.env,
      "1m",
      bucket,
    );
    const k = keyOf(row);
    const acc = perMinute.get(k) ?? { ...row, requests: 0, requests5xx: 0 };
    acc.requests = (acc.requests ?? 0) + r.count;
    acc.requests5xx = (acc.requests5xx ?? 0) + Math.min(r.count5xx, r.count);
    perMinute.set(k, acc);
  }
  report.unmappedHosts = unmapped.size;
  if (perMinute.size > 0) {
    const times = [...perMinute.values()].map((r) => r.bucket.getTime());
    const from = Math.min(...times);
    const to = Math.max(...times) + MINUTE_MS;
    const stored = new Map(
      (await store.rows("1m", new Date(from), new Date(to))).map((r) => [
        keyOf(r),
        r,
      ]),
    );
    for (const [k, row] of perMinute) {
      if (stored.get(k)?.requests != null) {
        report.skippedMinutes++;
        continue;
      }
      write.set(k, row);
      touched.push(row.bucket.getTime());
      report.requestMinutes++;
    }
  }
  if (write.size > 0) await store.put([...write.values()]);

  // Rollups: from the oldest hour touched now, or the last hour rolled, to the current hour —
  // never an hour whose minutes are already partly pruned.
  const oldestWhole = floorTo(now - KEEP_MINUTES_MS, HOUR_MS) + HOUR_MS;
  const lastRolled = (await store.latest("1h"))?.getTime() ?? oldestWhole;
  const from = Math.max(
    oldestWhole,
    Math.min(floorTo(Math.min(...touched), HOUR_MS), lastRolled),
  );
  const to = floorTo(now, HOUR_MS) + HOUR_MS;
  if (from < to) {
    const hours = rollupHours(
      await store.rows("1m", new Date(from), new Date(to)),
    );
    if (hours.length > 0) await store.put(hours);
    report.hoursRolled = new Set(hours.map((h) => h.bucket.getTime())).size;
  }

  report.pruned.minutes = await store.prune(
    "1m",
    new Date(now - KEEP_MINUTES_MS),
  );
  report.pruned.hours = await store.prune("1h", new Date(now - KEEP_HOURS_MS));
  return report;
}
