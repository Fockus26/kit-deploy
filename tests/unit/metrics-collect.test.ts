import { describe, expect, test } from "bun:test";
import type { MetricsSample } from "../../agent/metrics";
import type { MetricResolution } from "../../lib/db/schema";
import {
  collectMetrics,
  HOUR_MS,
  hostResolver,
  KEEP_HOURS_MS,
  KEEP_MINUTES_MS,
  keyOf,
  type MetricRow,
  type MetricsStore,
  MINUTE_MS,
  rollup,
} from "../../lib/metrics/collect";
import { latestPerSubject, toSeries } from "../../lib/metrics/read";

const T0 = Date.parse("2026-11-17T10:00:00.000Z");

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

function sample(at: number, over: Partial<MetricsSample> = {}): MetricsSample {
  return {
    at: new Date(at).toISOString(),
    vps: {
      memTotal: 8e9,
      memUsed: 4e9,
      diskTotal: 160e9,
      diskUsed: 40e9,
      load1: 0.5,
      cpus: 4,
    },
    containers: [
      {
        name: "kd_hello-prod-abcdef012345",
        project: "kd_hello",
        env: "production",
        cpuPct: 10,
        memBytes: 100,
        memLimitBytes: 512,
      },
    ],
    requests: [],
    errors: [],
    ...over,
  };
}

const minute = (ms: number) => new Date(ms).toISOString();
const find = (
  rows: Map<string, MetricRow>,
  scope: string,
  subject: string,
  resolution: MetricResolution,
  bucket: number,
) =>
  rows.get(
    keyOf({
      scope: scope as MetricRow["scope"],
      subject,
      resolution,
      bucket: new Date(bucket),
    }),
  );

describe("hosts to projects", () => {
  const resolve = hostResolver({
    domains: [{ host: "Hola.cl", project: "kd_hello" }],
    projects: ["kd_hello", "shop"],
  });
  test("production domains and preview hosts", () => {
    expect(resolve("hola.cl")).toEqual({
      project: "kd_hello",
      env: "production",
    });
    expect(resolve("kd-hello-pr-7.preview.fockus.dev")).toEqual({
      project: "kd_hello",
      env: "pr-7",
    });
    expect(resolve("shop-pr-12.preview.fockus.dev")?.env).toBe("pr-12");
  });
  test("anything else is no project's", () => {
    expect(resolve("db.fockus.dev")).toBeNull();
    expect(resolve("nope-pr-1.preview.fockus.dev")).toBeNull();
    expect(resolve("kd-hello-pr-0.preview.fockus.dev")).toBeNull();
  });
});

describe("collect", () => {
  test("two readings of a minute are averaged, not added", async () => {
    const m = memoryMetrics();
    await collectMetrics(sample(T0 + 5_000), m.store, T0 + 5_000);
    await collectMetrics(
      sample(T0 + 35_000, {
        containers: [
          {
            name: "kd_hello-prod-abcdef012345",
            project: "kd_hello",
            env: "production",
            cpuPct: 30,
            memBytes: 200,
            memLimitBytes: 512,
          },
        ],
      }),
      m.store,
      T0 + 35_000,
    );
    const c = find(m.rows, "container", "kd_hello-prod-abcdef012345", "1m", T0);
    expect(c?.samples).toBe(2);
    expect(c?.cpuPct).toBe(20);
    expect(c?.memBytes).toBe(150);
    expect(c?.memLimitBytes).toBe(512);
    const v = find(m.rows, "vps", "vps", "1m", T0);
    expect(v?.memBytes).toBe(4e9);
    expect(v?.cpus).toBe(4);
  });

  test("requests: hosts of one environment added; a minute already stored is not added again", async () => {
    const m = memoryMetrics();
    const requests = [
      {
        host: "kd-hello.fockus.dev",
        minute: minute(T0),
        count: 10,
        count5xx: 1,
      },
      { host: "www.hola.cl", minute: minute(T0), count: 5, count5xx: 0 },
      {
        host: "kd-hello-pr-3.preview.fockus.dev",
        minute: minute(T0),
        count: 2,
        count5xx: 2,
      },
      { host: "db.fockus.dev", minute: minute(T0), count: 7, count5xx: 0 },
    ];
    const s = sample(T0 + MINUTE_MS + 10_000, { requests });
    const first = await collectMetrics(s, m.store, T0 + MINUTE_MS + 10_000);
    expect(first.requestMinutes).toBe(2);
    expect(first.unmappedHosts).toBe(1);
    const prod = find(m.rows, "requests", "kd_hello/production", "1m", T0);
    expect([prod?.requests, prod?.requests5xx]).toEqual([15, 1]);
    expect(find(m.rows, "requests", "kd_hello/pr-3", "1m", T0)?.requests).toBe(
      2,
    );

    // The same sample again (a replay, a log read twice): nothing more.
    const again = await collectMetrics(s, m.store, T0 + MINUTE_MS + 40_000);
    expect(again.requestMinutes).toBe(0);
    expect(again.skippedMinutes).toBe(2);
    expect(
      find(m.rows, "requests", "kd_hello/production", "1m", T0)?.requests,
    ).toBe(15);
    // And the hour's rollup still counts them once.
    expect(
      find(m.rows, "requests", "kd_hello/production", "1h", T0)?.requests,
    ).toBe(15);
  });

  test("a backlog older than 48 h is not written", async () => {
    const m = memoryMetrics();
    const now = T0 + 50 * HOUR_MS;
    const r = await collectMetrics(
      sample(now, {
        requests: [
          { host: "www.hola.cl", minute: minute(T0), count: 1, count5xx: 0 },
        ],
      }),
      m.store,
      now,
    );
    expect(r.requestMinutes).toBe(0);
  });

  test("errors from the agent are carried; no VPS reading writes no VPS row", async () => {
    const m = memoryMetrics();
    const r = await collectMetrics(
      sample(T0, { vps: null, errors: ["vps: cannot read"] }),
      m.store,
      T0,
    );
    expect(r.errors).toEqual(["vps: cannot read"]);
    expect(r.vps).toBe(false);
    expect(find(m.rows, "vps", "vps", "1m", T0)).toBeUndefined();
  });
});

describe("rollups and pruning with a fake clock", () => {
  test("1-minute rows roll into their hour, recomputed (not added) on every run", async () => {
    const m = memoryMetrics();
    // Two hours of samples every 30 s, CPU = minute of the hour.
    for (let t = T0; t < T0 + 2 * HOUR_MS; t += 30_000) {
      const cpu = Math.floor((t - T0) / MINUTE_MS) % 60;
      await collectMetrics(
        sample(t, {
          containers: [
            {
              name: "kd_hello-prod-abcdef012345",
              project: "kd_hello",
              env: "production",
              cpuPct: cpu,
              memBytes: 100,
              memLimitBytes: 512,
            },
          ],
          // At each whole minute the agent closes the previous one.
          requests:
            t % MINUTE_MS === 0
              ? [
                  {
                    host: "www.hola.cl",
                    minute: minute(t - MINUTE_MS),
                    count: 3,
                    count5xx: 1,
                  },
                ]
              : [],
        }),
        m.store,
        t,
      );
    }
    const h0 = find(
      m.rows,
      "container",
      "kd_hello-prod-abcdef012345",
      "1h",
      T0,
    );
    expect(h0?.samples).toBe(120);
    expect(h0?.cpuPct).toBeCloseTo(29.5, 6);
    expect(h0?.memLimitBytes).toBe(512);
    // 10:59 is closed at 11:00 and the 10:00 hour is rolled again with it; 09:59 is 09:00's.
    const req0 = find(m.rows, "requests", "kd_hello/production", "1h", T0);
    expect(req0?.requests).toBe(60 * 3);
    expect(req0?.requests5xx).toBe(60);
    const v1 = find(m.rows, "vps", "vps", "1h", T0 + HOUR_MS);
    expect(v1?.samples).toBe(120);
    expect(v1?.diskTotalBytes).toBe(160e9);
  });

  test("1-minute rows go after 48 h, 1-hour rows after 30 days", async () => {
    const m = memoryMetrics();
    await collectMetrics(sample(T0), m.store, T0);
    expect(
      find(m.rows, "container", "kd_hello-prod-abcdef012345", "1h", T0),
    ).toBeDefined();

    const later = T0 + KEEP_MINUTES_MS + MINUTE_MS;
    const r = await collectMetrics(sample(later), m.store, later);
    expect(r.pruned.minutes).toBe(2);
    expect(find(m.rows, "vps", "vps", "1m", T0)).toBeUndefined();
    // The hour survives its minutes, and is not recomputed from what is left of them.
    expect(find(m.rows, "vps", "vps", "1h", T0)?.samples).toBe(1);

    const end = T0 + KEEP_HOURS_MS + HOUR_MS;
    const s = await collectMetrics(sample(end), m.store, end);
    expect(s.pruned.hours).toBeGreaterThanOrEqual(2);
    expect(find(m.rows, "vps", "vps", "1h", T0)).toBeUndefined();
    expect(
      find(m.rows, "vps", "vps", "1h", Math.floor(end / HOUR_MS) * HOUR_MS),
    ).toBeDefined();
  });

  test("rollup of nothing is a bug, not a row", () => {
    expect(() => rollup([], new Date(T0))).toThrow();
  });
});

describe("reading", () => {
  test("series add containers of a bucket and carry its requests", async () => {
    const m = memoryMetrics();
    const two = sample(T0, {
      containers: [
        {
          name: "kd_hello-prod-aaaaaaaaaaaa",
          project: "kd_hello",
          env: "production",
          cpuPct: 5,
          memBytes: 100,
          memLimitBytes: 512,
        },
        {
          name: "kd_hello-prod-bbbbbbbbbbbb",
          project: "kd_hello",
          env: "production",
          cpuPct: 7,
          memBytes: 50,
          memLimitBytes: 512,
        },
      ],
      requests: [
        { host: "www.hola.cl", minute: minute(T0), count: 4, count5xx: 1 },
      ],
    });
    await collectMetrics(two, m.store, T0 + MINUTE_MS + 10_000);
    const rows = (
      await m.store.rows("1m", new Date(0), new Date(T0 + HOUR_MS))
    ).filter((r) => r.project === "kd_hello" && r.environment === "production");
    expect(toSeries(rows)).toEqual([
      {
        bucket: new Date(T0),
        cpuPct: 12,
        memBytes: 150,
        memLimitBytes: 1024,
        requests: 4,
        requests5xx: 1,
      },
    ]);
    expect(latestPerSubject(rows).map((r) => r.subject)).toEqual([
      "kd_hello-prod-aaaaaaaaaaaa",
      "kd_hello-prod-bbbbbbbbbbbb",
      "kd_hello/production",
    ]);
  });
});
