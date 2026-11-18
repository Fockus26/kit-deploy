import { describe, expect, test } from "bun:test";
import { dispatch } from "../../agent/dispatch";
import { ACCESS_LOG } from "../../agent/metrics";
import { Agent } from "../../agent/ops";
import type { Response } from "../../agent/protocol";
import type { AgentClient } from "../../cli/client";
import { runCli } from "../../cli/commands";
import { humanBytes } from "../../cli/metrics-commands";
import type { MetricsReader } from "../../lib/metrics/read";
import type { LockedMetricsStore } from "../../lib/metrics/store";
import { fakeDeps } from "./agent-fakes";
import { memoryMetrics } from "./metrics-fakes";

const T0 = Date.parse("2026-11-17T10:00:00.000Z");

function machine(now: () => number) {
  const f = fakeDeps({
    "docker ps": () => ({
      stdout:
        "kd_hello-prod-abcdef012345\trunning\tghcr.io/x/y:1\tkd_hello\tkd_hello\tproduction\tabcdef0123456\t20001\n",
    }),
    "docker stats": () => ({
      stdout: `${JSON.stringify({ Name: "kd_hello-prod-abcdef012345", CPUPerc: "12.5%", MemUsage: "128MiB / 512MiB" })}\n`,
    }),
    df: () => ({ stdout: "1B-blocks Used\n1000 250\n" }),
  });
  f.files.set("/proc/meminfo", "MemTotal: 1000 kB\nMemAvailable: 400 kB\n");
  f.files.set("/proc/loadavg", "0.75 0.5 0.25 1/100 9\n");
  f.files.set("/proc/stat", "cpu 1\ncpu0 1\n");
  const agent = new Agent(f.deps, now);
  const sent: string[] = [];
  const client: AgentClient = {
    async call(op, params) {
      sent.push(op);
      return (await dispatch(
        agent,
        f.deps,
        JSON.stringify({ id: "t", op, params }),
      )) as Response;
    },
  };
  return { f, client, sent };
}

describe("kit-deploy metrics", () => {
  test("collect stores a sample; run twice it never counts a minute twice", async () => {
    let clock = T0 + 30_000;
    const now = () => clock;
    const { f, client } = machine(now);
    const line = (ms: number, status: number) =>
      `${JSON.stringify({ ts: ms / 1000, status, request: { host: "kd-hello.fockus.dev" } })}\n`;
    f.files.set(ACCESS_LOG, line(T0 + 1000, 200) + line(T0 + 2000, 500));
    const m = memoryMetrics();
    const store: LockedMetricsStore = {
      ...m.store,
      locked: (fn) => fn(m.store),
    };
    const ctx = {
      now,
      metrics: () => ({ store, reader: {} as MetricsReader }),
    };

    const a = await runCli(["metrics", "collect"], client, ctx);
    expect(a.code).toBe(0);
    expect(a.out).toContain("1 container(s), 0 request minute(s)");
    clock = T0 + 70_000;
    const b = await runCli(["metrics", "collect", "--json"], client, ctx);
    const report = JSON.parse(b.out);
    expect(report.requestMinutes).toBe(1);
    clock = T0 + 100_000;
    await runCli(["metrics", "collect"], client, ctx);
    const rows = [...m.rows.values()].filter(
      (r) => r.scope === "requests" && r.resolution === "1m",
    );
    expect(rows.map((r) => [r.subject, r.requests, r.requests5xx])).toEqual([
      ["kd_hello/production", 2, 1],
    ]);
  });

  test("collect: agent warnings go to stderr, the run still succeeds", async () => {
    const { f, client } = machine(() => T0);
    f.files.delete("/proc/meminfo");
    const m = memoryMetrics();
    const store: LockedMetricsStore = {
      ...m.store,
      locked: (fn) => fn(m.store),
    };
    const r = await runCli(["metrics", "collect"], client, {
      now: () => T0,
      metrics: () => ({ store, reader: {} as MetricsReader }),
    });
    expect(r.code).toBe(0);
    expect(r.err).toStartWith("warning: vps:");
  });

  test("<project> reads the database only, never the agent", async () => {
    const { client, sent } = machine(() => T0);
    const reader: MetricsReader = {
      async containers(project) {
        expect(project).toBe("kd_hello");
        return [
          {
            name: "kd_hello-prod-abcdef012345",
            project: "kd_hello",
            env: "production",
            at: new Date(T0),
            cpuPct: 150.25,
            memBytes: 256 * 1024 ** 2,
            memLimitBytes: 512 * 1024 ** 2,
          },
        ];
      },
      async vps() {
        return null;
      },
      async series() {
        return [];
      },
      async totals(_p, hours) {
        expect(hours).toBe(24);
        return [{ env: "production", requests: 1200, requests5xx: 3 }];
      },
    };
    const ctx = {
      metrics: () => ({ store: {} as LockedMetricsStore, reader }),
    };
    const r = await runCli(["metrics", "kd_hello"], client, ctx);
    expect(r.code).toBe(0);
    expect(r.out).toContain("150.3%");
    expect(r.out).toContain("256.0 MiB / 512.0 MiB (50%)");
    expect(r.out).toMatch(/production\s+1200\s+3/);
    expect(sent).toEqual([]);
    const j = await runCli(["metrics", "kd_hello", "--json"], client, ctx);
    expect(JSON.parse(j.out).last24h).toEqual([
      { env: "production", requests: 1200, requests5xx: 3 },
    ]);
  });

  test("usage, a bad project name, and no database", async () => {
    const { client } = machine(() => T0);
    expect((await runCli(["metrics"], client)).code).toBe(2);
    expect((await runCli(["metrics", "a", "b"], client)).code).toBe(2);
    const bad = await runCli(["metrics", "../etc"], client, {
      metrics: () => ({
        store: {} as LockedMetricsStore,
        reader: {} as MetricsReader,
      }),
    });
    expect(bad.code).toBe(2);
    const nodb = await runCli(["metrics", "kd_hello"], client);
    expect(nodb.code).toBe(1);
    expect(nodb.err).toContain("needs the database");
  });

  test("bytes like Docker's", () => {
    expect(humanBytes(0)).toBe("0 B");
    expect(humanBytes(1536)).toBe("1.5 KiB");
    expect(humanBytes(null)).toBe("-");
  });
});
