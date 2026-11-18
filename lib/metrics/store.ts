/**
 * The real `MetricsStore` (lib/metrics/collect.ts) over `metric_samples`: reads, upserts by the
 * row's slot, deletes. Every decision (merging, rollups, what to prune) is in collect.ts.
 */
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import {
  domains,
  type MetricResolution,
  metricSamples,
  projects,
} from "../db/schema";
import type { Db } from "../db/store";
import type { MetricRow, MetricsStore } from "./collect";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Rows per INSERT: well under Postgres' 65 535 parameters (17 columns each). */
const CHUNK = 500;

export interface LockedMetricsStore extends MetricsStore {
  /** `fn` in one transaction, one collect at a time (the timer's and one typed by hand). */
  locked<T>(fn: (store: MetricsStore) => Promise<T>): Promise<T>;
}

function storeOn(db: Db | Tx): MetricsStore {
  return {
    async hosts() {
      const [d, p] = await Promise.all([
        db
          .select({ host: domains.host, project: projects.name })
          .from(domains)
          .innerJoin(projects, eq(domains.projectId, projects.id)),
        db.select({ name: projects.name }).from(projects),
      ]);
      return { domains: d, projects: p.map((r) => r.name) };
    },

    async rows(resolution, from, to) {
      const rows = await db
        .select()
        .from(metricSamples)
        .where(
          and(
            eq(metricSamples.resolution, resolution),
            gte(metricSamples.bucket, from),
            lt(metricSamples.bucket, to),
          ),
        );
      return rows.map(({ id: _id, ...r }) => r as MetricRow);
    },

    async put(rows) {
      for (let i = 0; i < rows.length; i += CHUNK) {
        await db
          .insert(metricSamples)
          .values(rows.slice(i, i + CHUNK))
          .onConflictDoUpdate({
            target: [
              metricSamples.scope,
              metricSamples.subject,
              metricSamples.resolution,
              metricSamples.bucket,
            ],
            set: {
              samples: sql`excluded.samples`,
              cpuPct: sql`excluded.cpu_pct`,
              memBytes: sql`excluded.mem_bytes`,
              memLimitBytes: sql`excluded.mem_limit_bytes`,
              diskBytes: sql`excluded.disk_bytes`,
              diskTotalBytes: sql`excluded.disk_total_bytes`,
              load1: sql`excluded.load1`,
              cpus: sql`excluded.cpus`,
              requests: sql`excluded.requests`,
              requests5xx: sql`excluded.requests_5xx`,
            },
          });
      }
    },

    async prune(resolution: MetricResolution, before: Date) {
      const gone = await db
        .delete(metricSamples)
        .where(
          and(
            eq(metricSamples.resolution, resolution),
            lt(metricSamples.bucket, before),
          ),
        )
        .returning({ id: metricSamples.id });
      return gone.length;
    },

    async latest(resolution) {
      const [row] = await db
        .select({ bucket: metricSamples.bucket })
        .from(metricSamples)
        .where(eq(metricSamples.resolution, resolution))
        .orderBy(desc(metricSamples.bucket))
        .limit(1);
      return row?.bucket ?? null;
    },
  };
}

export function drizzleMetricsStore(db: Db): LockedMetricsStore {
  return {
    ...storeOn(db),
    locked(fn) {
      return db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext('kit-deploy:metrics-collect'))`,
        );
        return fn(storeOn(tx));
      });
    },
  };
}
