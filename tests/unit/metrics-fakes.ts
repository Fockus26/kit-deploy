import type { MetricResolution } from "../../lib/db/schema";
import {
  keyOf,
  type MetricRow,
  type MetricsStore,
} from "../../lib/metrics/collect";

/** The same contract as lib/metrics/store.ts, in a Map. */
export function memoryMetrics(
  hosts = {
    domains: [
      { host: "kd-hello.fockus.dev", project: "kd_hello" },
      { host: "www.hola.cl", project: "kd_hello" },
    ],
    projects: ["kd_hello", "kd_other"],
  },
) {
  const rows = new Map<string, MetricRow>();
  const store: MetricsStore = {
    async hosts() {
      return hosts;
    },
    async rows(resolution, from, to) {
      return [...rows.values()]
        .filter(
          (r) =>
            r.resolution === resolution && r.bucket >= from && r.bucket < to,
        )
        .map((r) => ({ ...r }));
    },
    async put(list) {
      for (const r of list) rows.set(keyOf(r), { ...r });
    },
    async prune(resolution: MetricResolution, before: Date) {
      let n = 0;
      for (const [k, r] of rows)
        if (r.resolution === resolution && r.bucket < before) {
          rows.delete(k);
          n++;
        }
      return n;
    },
    async latest(resolution) {
      const ts = [...rows.values()]
        .filter((r) => r.resolution === resolution)
        .map((r) => r.bucket.getTime());
      return ts.length ? new Date(Math.max(...ts)) : null;
    },
  };
  return { store, rows };
}
