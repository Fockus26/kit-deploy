/**
 * Reading `metric_samples` for the dashboard (Inicio "Estado del servidor", Proyecto "Métricas")
 * and `kit-deploy metrics <project>`. Server only: it opens the database (D012) — never import it
 * from a client component. The SQL only filters; grouping into series is `toSeries` (tested).
 */
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { type MetricResolution, metricSamples } from "../db/schema";
import type { Db } from "../db/store";
import { HOUR_MS, type MetricRow, MINUTE_MS } from "./collect";

/** A container with no reading for this long is not running any more. */
export const STALE_MS = 5 * MINUTE_MS;

export type ContainerNow = {
  name: string;
  project: string;
  env: string;
  at: Date;
  cpuPct: number | null;
  memBytes: number | null;
  memLimitBytes: number | null;
};

export type VpsNow = {
  at: Date;
  memUsed: number | null;
  memTotal: number | null;
  diskUsed: number | null;
  diskTotal: number | null;
  load1: number | null;
  cpus: number | null;
};

export type SeriesPoint = {
  bucket: Date;
  /** Every container of the environment in that bucket, added (two during a switch). */
  cpuPct: number | null;
  memBytes: number | null;
  memLimitBytes: number | null;
  requests: number;
  requests5xx: number;
};

export type RequestTotals = {
  env: string;
  requests: number;
  requests5xx: number;
};

export interface MetricsReader {
  /** The last reading of every container seen in the last 5 minutes, of one project or all. */
  containers(project?: string): Promise<ContainerNow[]>;
  vps(): Promise<VpsNow | null>;
  /** One environment's buckets over the last `hours`, oldest first (1m up to 48 h, else 1h). */
  series(
    project: string,
    env: string,
    hours: number,
    resolution?: MetricResolution,
  ): Promise<SeriesPoint[]>;
  /** Requests and 5xx of the last `hours` per environment (from 1-minute rows: ≤ 48 h). */
  totals(project: string, hours: number): Promise<RequestTotals[]>;
}

/** The newest row per subject (rows in any order). */
export function latestPerSubject(rows: MetricRow[]): MetricRow[] {
  const by = new Map<string, MetricRow>();
  for (const r of rows) {
    const seen = by.get(r.subject);
    if (!seen || seen.bucket < r.bucket) by.set(r.subject, r);
  }
  return [...by.values()].sort((a, b) => a.subject.localeCompare(b.subject));
}

/** Container and request rows of one environment into one point per bucket, oldest first. */
export function toSeries(rows: MetricRow[]): SeriesPoint[] {
  const by = new Map<number, SeriesPoint>();
  const add = (a: number | null, b: number | null) =>
    b === null ? a : (a ?? 0) + b;
  for (const r of rows) {
    const t = r.bucket.getTime();
    const p = by.get(t) ?? {
      bucket: r.bucket,
      cpuPct: null,
      memBytes: null,
      memLimitBytes: null,
      requests: 0,
      requests5xx: 0,
    };
    if (r.scope === "container") {
      p.cpuPct = add(p.cpuPct, r.cpuPct);
      p.memBytes = add(p.memBytes, r.memBytes);
      p.memLimitBytes = add(p.memLimitBytes, r.memLimitBytes);
    } else if (r.scope === "requests") {
      p.requests += r.requests ?? 0;
      p.requests5xx += r.requests5xx ?? 0;
    }
    by.set(t, p);
  }
  return [...by.values()].sort(
    (a, b) => a.bucket.getTime() - b.bucket.getTime(),
  );
}

const asRow = ({ id: _id, ...r }: typeof metricSamples.$inferSelect) =>
  r as MetricRow;

export function drizzleMetricsReader(
  db: Db,
  now: () => number = Date.now,
): MetricsReader {
  const since = (ms: number) => new Date(now() - ms);
  return {
    async containers(project) {
      const rows = await db
        .select()
        .from(metricSamples)
        .where(
          and(
            eq(metricSamples.scope, "container"),
            eq(metricSamples.resolution, "1m"),
            gte(metricSamples.bucket, since(STALE_MS)),
            project ? eq(metricSamples.project, project) : undefined,
          ),
        );
      return latestPerSubject(rows.map(asRow)).map((r) => ({
        name: r.subject,
        project: r.project ?? "",
        env: r.environment ?? "",
        at: r.bucket,
        cpuPct: r.cpuPct,
        memBytes: r.memBytes,
        memLimitBytes: r.memLimitBytes,
      }));
    },

    async vps() {
      const [r] = await db
        .select()
        .from(metricSamples)
        .where(
          and(
            eq(metricSamples.scope, "vps"),
            eq(metricSamples.resolution, "1m"),
          ),
        )
        .orderBy(desc(metricSamples.bucket))
        .limit(1);
      if (!r) return null;
      return {
        at: r.bucket,
        memUsed: r.memBytes,
        memTotal: r.memLimitBytes,
        diskUsed: r.diskBytes,
        diskTotal: r.diskTotalBytes,
        load1: r.load1,
        cpus: r.cpus,
      };
    },

    async series(project, env, hours, resolution) {
      const res = resolution ?? (hours <= 48 ? "1m" : "1h");
      const rows = await db
        .select()
        .from(metricSamples)
        .where(
          and(
            inArray(metricSamples.scope, ["container", "requests"]),
            eq(metricSamples.project, project),
            eq(metricSamples.environment, env),
            eq(metricSamples.resolution, res),
            gte(metricSamples.bucket, since(hours * HOUR_MS)),
          ),
        );
      return toSeries(rows.map(asRow));
    },

    async totals(project, hours) {
      const rows = await db
        .select({
          env: metricSamples.environment,
          requests: sql<number>`coalesce(sum(${metricSamples.requests}), 0)::bigint`,
          requests5xx: sql<number>`coalesce(sum(${metricSamples.requests5xx}), 0)::bigint`,
        })
        .from(metricSamples)
        .where(
          and(
            eq(metricSamples.scope, "requests"),
            eq(metricSamples.project, project),
            eq(metricSamples.resolution, "1m"),
            gte(metricSamples.bucket, since(Math.min(hours, 48) * HOUR_MS)),
          ),
        )
        .groupBy(metricSamples.environment)
        .orderBy(metricSamples.environment);
      return rows.map((r) => ({
        env: r.env ?? "",
        requests: Number(r.requests),
        requests5xx: Number(r.requests5xx),
      }));
    },
  };
}
