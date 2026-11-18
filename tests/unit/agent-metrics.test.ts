import { describe, expect, test } from "bun:test";
import { dispatch } from "../../agent/dispatch";
import {
  ACCESS_LOG,
  closeMinutes,
  containerEnv,
  MAX_HOSTS,
  MAX_LOG_READ,
  METRICS_STATE,
  type MetricsSample,
  normaliseHost,
  parseBytes,
  parseCpuCount,
  parseDf,
  parseDockerStats,
  parseLoadavg,
  parseLogState,
  parseMeminfo,
  parsePercent,
  readRequests,
} from "../../agent/metrics";
import { Agent, type ManagedContainer } from "../../agent/ops";
import { Request } from "../../agent/protocol";
import { MANAGED_LABEL } from "../../lib/core";
import { fakeDeps } from "./agent-fakes";

const T0 = Date.parse("2026-11-17T10:00:00.000Z");
const MIN = 60_000;

function line(host: string, atMs: number, status = 200): string {
  return `${JSON.stringify({
    level: "info",
    ts: atMs / 1000,
    logger: "http.log.access.log0",
    msg: "handled request",
    request: { host, method: "GET", uri: "/" },
    status,
  })}\n`;
}

function managed(
  name: string,
  project: string,
  env: "production" | "preview",
  site: string,
): ManagedContainer {
  return {
    name,
    state: "running",
    image: `ghcr.io/x/${project}:abc`,
    site,
    project,
    env,
    sha: "abcdef0123456",
    port: 20001,
  };
}

describe("parsing", () => {
  test("bytes in docker's binary and decimal units", () => {
    expect(parseBytes("12.3MiB")).toBe(Math.round(12.3 * 1024 ** 2));
    expect(parseBytes(" 512MiB")).toBe(512 * 1024 ** 2);
    expect(parseBytes("1.944GiB")).toBe(Math.round(1.944 * 1024 ** 3));
    expect(parseBytes("1.5GB")).toBe(1.5e9);
    expect(parseBytes("980kB")).toBe(980_000);
    expect(parseBytes("0B")).toBe(0);
    expect(parseBytes("--")).toBeNull();
    expect(parseBytes("12XB")).toBeNull();
  });

  test("percent, also above 100 on several cores", () => {
    expect(parsePercent("0.50%")).toBe(0.5);
    expect(parsePercent("187.25%")).toBe(187.25);
    expect(parsePercent("--")).toBeNull();
  });

  test("docker stats keeps only managed containers, with their env", () => {
    const list = [
      managed(
        "kd_hello-prod-abcdef012345",
        "kd_hello",
        "production",
        "kd_hello",
      ),
      managed(
        "kd_hello-pr-7-abcdef012345-g2",
        "kd_hello",
        "preview",
        "kd_hello-pr-7",
      ),
    ];
    const stdout = [
      JSON.stringify({
        Name: "kd_hello-prod-abcdef012345",
        CPUPerc: "150.10%",
        MemUsage: "120.5MiB / 512MiB",
      }),
      JSON.stringify({
        Name: "kd_hello-pr-7-abcdef012345-g2",
        CPUPerc: "0.00%",
        MemUsage: "40MiB / 384MiB",
      }),
      JSON.stringify({
        Name: "gaby",
        CPUPerc: "3%",
        MemUsage: "1GiB / 7.7GiB",
      }),
      JSON.stringify({
        Name: "kd_hello-prod-abcdef012345",
        CPUPerc: "--",
        MemUsage: "-- / --",
      }),
      "not json",
      "",
    ].join("\n");
    expect(parseDockerStats(stdout, list)).toEqual([
      {
        name: "kd_hello-prod-abcdef012345",
        project: "kd_hello",
        env: "production",
        cpuPct: 150.1,
        memBytes: Math.round(120.5 * 1024 ** 2),
        memLimitBytes: 512 * 1024 ** 2,
      },
      {
        name: "kd_hello-pr-7-abcdef012345-g2",
        project: "kd_hello",
        env: "pr-7",
        cpuPct: 0,
        memBytes: 40 * 1024 ** 2,
        memLimitBytes: 384 * 1024 ** 2,
      },
    ]);
  });

  test("labels that disagree give no env", () => {
    expect(
      containerEnv(managed("x", "kd_hello", "preview", "other-pr-7")),
    ).toBeNull();
    expect(
      containerEnv(managed("x", "kd_hello", "production", "kd_other")),
    ).toBeNull();
  });

  test("meminfo, loadavg, /proc/stat and df", () => {
    expect(
      parseMeminfo(
        "MemTotal:        8000000 kB\nMemFree:  100 kB\nMemAvailable:    3000000 kB\n",
      ),
    ).toEqual({ memTotal: 8_000_000 * 1024, memUsed: 5_000_000 * 1024 });
    expect(parseMeminfo("MemTotal: 1 kB\n")).toBeNull();
    expect(parseLoadavg("0.42 0.30 0.20 1/300 12345\n")).toBe(0.42);
    expect(parseCpuCount("cpu  1 2 3\ncpu0 1 2\ncpu1 3 4\nintr 5\n")).toBe(2);
    expect(
      parseDf("     1B-blocks        Used\n 160000000000 40000000000\n"),
    ).toEqual({ diskTotal: 160_000_000_000, diskUsed: 40_000_000_000 });
    expect(parseDf("garbage")).toBeNull();
  });

  test("hosts: lowercase, no port, DNS names only", () => {
    expect(normaliseHost("Kd-Hello.fockus.dev:443")).toBe(
      "kd-hello.fockus.dev",
    );
    expect(normaliseHost("a b")).toBeNull();
    expect(normaliseHost("x".repeat(300))).toBeNull();
    expect(normaliseHost(42)).toBeNull();
  });

  test("a bad state file starts over", () => {
    expect(parseLogState("{nope").offset).toBe(0);
    expect(parseLogState('{"ino":1}').pending).toEqual({});
    expect(parseLogState(null).through).toBe(0);
  });
});

describe("access log", () => {
  test("counts per host per minute and returns only minutes that are over", async () => {
    const f = fakeDeps();
    f.files.set(
      ACCESS_LOG,
      line("a.fockus.dev", T0 + 1000) +
        line("a.fockus.dev", T0 + 2000, 502) +
        line("B.fockus.dev", T0 + 3000) +
        line("a.fockus.dev", T0 + MIN + 1000, 500),
    );
    const first = await readRequests(f.deps, T0 + MIN + 10_000);
    expect(first.requests).toEqual([
      {
        host: "a.fockus.dev",
        minute: "2026-11-17T10:00:00.000Z",
        count: 2,
        count5xx: 1,
      },
      {
        host: "b.fockus.dev",
        minute: "2026-11-17T10:00:00.000Z",
        count: 1,
        count5xx: 0,
      },
    ]);
    // The minute in progress is kept in the state, not returned.
    const state = parseLogState(f.files.get(METRICS_STATE) ?? null);
    expect(state.pending["a.fockus.dev"]?.[String(T0 + MIN)]).toEqual([1, 1]);
    expect(f.privateFiles.at(-1)?.path).toBe(METRICS_STATE);

    // Nothing new, the clock moved: the kept minute comes out once.
    const second = await readRequests(f.deps, T0 + 2 * MIN + 10_000);
    expect(second.requests).toEqual([
      {
        host: "a.fockus.dev",
        minute: "2026-11-17T10:01:00.000Z",
        count: 1,
        count5xx: 1,
      },
    ]);
    const third = await readRequests(f.deps, T0 + 3 * MIN + 10_000);
    expect(third.requests).toEqual([]);
  });

  test("a minute closes only after the grace", async () => {
    const f = fakeDeps();
    f.files.set(ACCESS_LOG, line("a.fockus.dev", T0 + 1000));
    expect((await readRequests(f.deps, T0 + MIN + 2000)).requests).toEqual([]);
    expect((await readRequests(f.deps, T0 + MIN + 6000)).requests).toHaveLength(
      1,
    );
  });

  test("a partial line at the end waits for the rest", async () => {
    const f = fakeDeps();
    const whole = line("a.fockus.dev", T0 + 1000);
    const next = line("a.fockus.dev", T0 + 2000);
    f.files.set(ACCESS_LOG, whole + next.slice(0, 20));
    await readRequests(f.deps, T0 + 30_000);
    expect(parseLogState(f.files.get(METRICS_STATE) ?? null).offset).toBe(
      Buffer.byteLength(whole),
    );
    f.files.set(ACCESS_LOG, whole + next);
    const r = await readRequests(f.deps, T0 + MIN + 10_000);
    expect(r.requests).toEqual([
      {
        host: "a.fockus.dev",
        minute: "2026-11-17T10:00:00.000Z",
        count: 2,
        count5xx: 0,
      },
    ]);
    expect(r.dropped).toBe(0);
  });

  test("a rolled log (new inode or shorter) is read from its start", async () => {
    const f = fakeDeps();
    f.files.set(ACCESS_LOG, line("a.fockus.dev", T0 + 1000).repeat(3));
    await readRequests(f.deps, T0 + 30_000);
    // Caddy rolled it: a new file, already with one line.
    f.inodes.set(ACCESS_LOG, 2);
    f.files.set(ACCESS_LOG, line("a.fockus.dev", T0 + 40_000));
    const r = await readRequests(f.deps, T0 + MIN + 10_000);
    expect(r.requests[0]?.count).toBe(4);

    // Truncated in place (same inode, shorter than the offset).
    f.files.set(ACCESS_LOG, line("a.dev", T0 + MIN + 1000));
    const s = await readRequests(f.deps, T0 + 2 * MIN + 10_000);
    expect(s.requests[0]?.count).toBe(1);
  });

  test("late lines for a minute already returned are dropped, not counted twice", async () => {
    const f = fakeDeps();
    f.files.set(ACCESS_LOG, line("a.fockus.dev", T0 + 1000));
    await readRequests(f.deps, T0 + MIN + 10_000);
    f.files.set(
      ACCESS_LOG,
      line("a.fockus.dev", T0 + 1000) + line("a.fockus.dev", T0 + 2000),
    );
    const r = await readRequests(f.deps, T0 + 2 * MIN + 10_000);
    expect(r.requests).toEqual([]);
    expect(r.dropped).toBe(1);
  });

  test("lines that are not access lines, or dated far ahead, are dropped", async () => {
    const f = fakeDeps();
    f.files.set(
      ACCESS_LOG,
      `${'{"level":"info","msg":"x"}\n'}not json\n${line("bad host!", T0)}${line("a.fockus.dev", T0 + 60 * MIN)}`,
    );
    const r = await readRequests(f.deps, T0 + MIN + 10_000);
    expect(r.dropped).toBe(4);
    expect(r.requests).toEqual([]);
  });

  test("a host named like an Object property is counted as a host", async () => {
    const f = fakeDeps();
    f.files.set(ACCESS_LOG, line("constructor", T0) + line("constructor", T0));
    const r = await readRequests(f.deps, T0 + MIN + 10_000);
    expect(r.requests).toEqual([
      {
        host: "constructor",
        minute: "2026-11-17T10:00:00.000Z",
        count: 2,
        count5xx: 0,
      },
    ]);
  });

  test("hosts are bounded", async () => {
    const f = fakeDeps();
    let text = "";
    for (let i = 0; i <= MAX_HOSTS; i++)
      text += line(`h${i}.preview.fockus.dev`, T0);
    f.files.set(ACCESS_LOG, text);
    const r = await readRequests(f.deps, T0 + MIN + 10_000);
    expect(r.requests).toHaveLength(MAX_HOSTS);
    expect(r.dropped).toBe(1);
  });

  test("a big backlog is read in pieces, minutes closed by the last line read", async () => {
    const f = fakeDeps();
    const one = line("a.fockus.dev", T0);
    const perMinute = Math.ceil(MAX_LOG_READ / one.length);
    let text = "";
    for (let m = 0; m < 3; m++)
      text += line("a.fockus.dev", T0 + m * MIN).repeat(perMinute);
    f.files.set(ACCESS_LOG, text);
    const now = T0 + 60 * MIN;
    const out = [];
    for (let i = 0; i < 6; i++)
      out.push(...(await readRequests(f.deps, now)).requests);
    expect(out.map((r) => [r.minute, r.count])).toEqual([
      ["2026-11-17T10:00:00.000Z", perMinute],
      ["2026-11-17T10:01:00.000Z", perMinute],
      ["2026-11-17T10:02:00.000Z", perMinute],
    ]);
  });

  test("no log yet: nothing, and no state written", async () => {
    const f = fakeDeps();
    expect(await readRequests(f.deps, T0)).toEqual({
      requests: [],
      dropped: 0,
    });
    expect(f.files.has(METRICS_STATE)).toBe(false);
  });

  test("closeMinutes keeps later minutes and moves `through`", () => {
    const s = parseLogState(null);
    s.pending = { "a.x": { [String(T0)]: [1, 0], [String(T0 + MIN)]: [2, 0] } };
    expect(closeMinutes(s, T0 + MIN)).toHaveLength(1);
    expect(s.through).toBe(T0 + MIN);
    expect(Object.keys(s.pending["a.x"] ?? {})).toEqual([String(T0 + MIN)]);
  });
});

describe("metrics.sample", () => {
  function machine() {
    const f = fakeDeps({
      "docker ps": () => ({
        stdout: `kd_hello-prod-abcdef012345\trunning\tghcr.io/x/y:1\tkd_hello\tkd_hello\tproduction\tabcdef0123456\t20001\nkd_hello-prod-111111111111\texited\tghcr.io/x/y:0\tkd_hello\tkd_hello\tproduction\t1111111111111\t20002\n`,
      }),
      "docker stats": () => ({
        stdout: `${JSON.stringify({ Name: "kd_hello-prod-abcdef012345", CPUPerc: "1.5%", MemUsage: "100MiB / 512MiB" })}\n${JSON.stringify({ Name: "gaby", CPUPerc: "9%", MemUsage: "1GiB / 7GiB" })}\n`,
      }),
      df: () => ({ stdout: "1B-blocks Used\n1000 250\n" }),
    });
    f.files.set("/proc/meminfo", "MemTotal: 1000 kB\nMemAvailable: 400 kB\n");
    f.files.set("/proc/loadavg", "0.75 0.5 0.25 1/100 9\n");
    f.files.set("/proc/stat", "cpu 1\ncpu0 1\ncpu1 1\ncpu2 1\ncpu3 1\n");
    f.files.set(ACCESS_LOG, line("kd-hello.fockus.dev", T0 + 1000, 503));
    return f;
  }

  test("the schema takes no params", () => {
    expect(
      Request.safeParse({ id: "a", op: "metrics.sample", params: {} }).success,
    ).toBe(true);
    expect(
      Request.safeParse({
        id: "a",
        op: "metrics.sample",
        params: { path: "/etc/shadow" },
      }).success,
    ).toBe(false);
  });

  test("one sample: VPS, the managed running containers, closed request minutes", async () => {
    const f = machine();
    const agent = new Agent(f.deps, () => T0 + MIN + 10_000);
    const res = await dispatch(
      agent,
      f.deps,
      JSON.stringify({ id: "m1", op: "metrics.sample", params: {} }),
    );
    expect(res.ok).toBe(true);
    const s = (res as { result: MetricsSample }).result;
    expect(s.at).toBe("2026-11-17T10:01:10.000Z");
    expect(s.vps).toEqual({
      memTotal: 1000 * 1024,
      memUsed: 600 * 1024,
      diskTotal: 1000,
      diskUsed: 250,
      load1: 0.75,
      cpus: 4,
    });
    expect(s.containers).toEqual([
      {
        name: "kd_hello-prod-abcdef012345",
        project: "kd_hello",
        env: "production",
        cpuPct: 1.5,
        memBytes: 100 * 1024 ** 2,
        memLimitBytes: 512 * 1024 ** 2,
      },
    ]);
    expect(s.requests).toEqual([
      {
        host: "kd-hello.fockus.dev",
        minute: "2026-11-17T10:00:00.000Z",
        count: 1,
        count5xx: 1,
      },
    ]);
    expect(s.errors).toEqual([]);
    // Only the label filter lists containers; stats are read, nothing is run against one.
    const ps = f.calls.find((c) => c[1] === "ps");
    expect(ps).toContain(`--filter=label=${MANAGED_LABEL}=1`);
    expect(
      f.calls.every(
        (c) => c[0] !== "docker" || ["ps", "stats"].includes(c[1] ?? ""),
      ),
    ).toBe(true);
  });

  test("a failing part is reported; the others still come back", async () => {
    const f = machine();
    const g = fakeDeps({
      "docker ps": () => ({
        code: 1,
        stderr: "Cannot connect to the Docker daemon",
      }),
      df: () => ({ stdout: "1B-blocks Used\n1000 250\n" }),
    });
    for (const [k, v] of f.files) g.files.set(k, v);
    const agent = new Agent(g.deps, () => T0 + MIN + 10_000);
    const s = (await agent.execute({
      id: "x",
      op: "metrics.sample",
      params: {},
    })) as MetricsSample;
    expect(s.containers).toEqual([]);
    expect(s.errors).toHaveLength(1);
    expect(s.errors[0]).toStartWith("containers:");
    expect(s.vps?.cpus).toBe(4);
    expect(s.requests).toHaveLength(1);
  });

  test("two samples at once read the log once", async () => {
    const f = machine();
    const agent = new Agent(f.deps, () => T0 + MIN + 10_000);
    const req = { id: "x", op: "metrics.sample", params: {} } as const;
    const [a, b] = (await Promise.all([
      agent.execute(req),
      agent.execute(req),
    ])) as [MetricsSample, MetricsSample];
    expect(a.requests.length + b.requests.length).toBe(1);
  });
});
