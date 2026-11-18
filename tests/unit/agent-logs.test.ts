import { describe, expect, test } from "bun:test";
import { dispatch } from "../../agent/dispatch";
import {
  addDays,
  capLine,
  type LogDeps,
  LogFollower,
  levelOf,
  logPath,
  MAX_DAY_BYTES,
  MAX_LINE_CHARS,
  MAX_RESULT_BYTES,
  normalizeTs,
  projectDir,
  type Stream,
  searchLogs,
  sinceArg,
  tailLogs,
} from "../../agent/logs";
import { frameDecoder } from "../../agent/logs-system";
import { Agent, type ManagedContainer } from "../../agent/ops";
import { fakeDeps } from "./agent-fakes";

const ROOT = "/var/lib/kit-deploy/logs";
const T0 = Date.parse("2026-11-17T12:00:00Z");
const PROD = "kd_hello-prod-3f2a9c1e7b4d";
const PR = "kd_hello-pr-7-3f2a9c1e7b4d";

type Follow = {
  container: string;
  since: string;
  push: (stream: Stream, raw: string) => void;
  end: () => void;
  signal: AbortSignal;
};

/** In-memory LogDeps: files in a Map (`.gz` kept as plain text), follows the test drives. */
function fakeLogs() {
  const files = new Map<string, string>();
  const follows: Follow[] = [];
  const gzipped: string[] = [];
  const deps: LogDeps = {
    follow(container, since, onLine, signal) {
      return new Promise<void>((resolve) => {
        follows.push({
          container,
          since,
          push: onLine,
          end: resolve,
          signal,
        });
        signal.addEventListener("abort", () => resolve());
      });
    },
    async append(path, text) {
      files.set(path, (files.get(path) ?? "") + text);
    },
    async size(path) {
      return Buffer.byteLength(files.get(path) ?? "");
    },
    async *lines(path) {
      const t = files.get(path);
      if (t === undefined) return;
      const ls = t.split("\n");
      if (ls.at(-1) === "") ls.pop();
      yield* ls;
    },
    async readTail(path, max) {
      const t = files.get(path);
      if (t === undefined) return null;
      return t.length > max
        ? { text: t.slice(-max), whole: false }
        : { text: t, whole: true };
    },
    async list(dir, kind) {
      const prefix = `${dir}/`;
      const names = new Set<string>();
      for (const k of files.keys()) {
        if (!k.startsWith(prefix)) continue;
        const rest = k.slice(prefix.length);
        const slash = rest.indexOf("/");
        if (kind === "file" && slash === -1) names.add(rest);
        if (kind === "dir" && slash > 0) names.add(rest.slice(0, slash));
      }
      return [...names];
    },
    async gzip(path) {
      gzipped.push(path);
      files.set(
        `${path}.gz`,
        (files.get(`${path}.gz`) ?? "") + (files.get(path) ?? ""),
      );
      files.delete(path);
    },
    async remove(path) {
      files.delete(path);
    },
  };
  return { deps, files, follows, gzipped };
}

function container(
  name: string,
  over: Partial<ManagedContainer> = {},
): ManagedContainer {
  const pr = /-pr-(\d+)-/.exec(name)?.[1];
  return {
    name,
    state: "running",
    image: "ghcr.io/x/y:1",
    site: pr ? `kd_hello-pr-${pr}` : "kd_hello",
    project: "kd_hello",
    env: pr ? "preview" : "production",
    sha: "3f2a9c1e7b4d",
    port: 20001,
    ...over,
  };
}

function setup(running: ManagedContainer[] = [container(PROD)]) {
  const f = fakeLogs();
  let now = T0;
  const events: Record<string, unknown>[] = [];
  const state = { running };
  const follower = new LogFollower(
    f.deps,
    async () => state.running,
    (e) => events.push(e),
    () => now,
  );
  return {
    ...f,
    follower,
    events,
    state,
    setNow(ms: number) {
      now = ms;
    },
  };
}

const rec = (ts: string, line: string, over: Record<string, string> = {}) =>
  JSON.stringify({
    ts,
    container: PROD,
    env: "production",
    stream: "stdout",
    line,
    ...over,
  });

const today = `${ROOT}/kd_hello/2026-11-17.log`;

describe("timestamps", () => {
  test("normalizes Docker's RFC3339Nano to 9 decimals", () => {
    expect(normalizeTs("2026-11-17T10:00:00.5Z")).toBe(
      "2026-11-17T10:00:00.500000000Z",
    );
    expect(normalizeTs("2026-11-17T10:00:00Z")).toBe(
      "2026-11-17T10:00:00.000000000Z",
    );
    expect(normalizeTs("garbage")).toBeNull();
    expect(sinceArg("2026-11-17T10:00:00.500000000Z")).toBe(
      `${Date.parse("2026-11-17T10:00:00Z") / 1000}.500000000`,
    );
  });
});

describe("paths", () => {
  test("only <root>/<project>/<day>.log", () => {
    expect(logPath("kd_hello", "2026-11-17")).toBe(today);
    expect(logPath("kd_hello", "2026-11-17", true)).toBe(`${today}.gz`);
    expect(() => projectDir("../etc")).toThrow();
    expect(() => projectDir("kd/../../etc")).toThrow();
    expect(() => logPath("kd_hello", "../../passwd")).toThrow();
    expect(() => logPath("kd_hello", "2026-11-17/../x")).toThrow();
  });
});

describe("follower", () => {
  test("writes each line as JSON to today's file, scrubbed and capped", async () => {
    const s = setup([container(PROD), container(PR)]);
    await s.follower.reconcile();
    expect(s.follower.following()).toEqual([PR, PROD]);
    const prod = s.follows.find((x) => x.container === PROD);
    const pr = s.follows.find((x) => x.container === PR);
    // Never seen: from the start of today.
    expect(prod?.since).toBe(sinceArg("2026-11-17T00:00:00.000000000Z"));
    prod?.push("stdout", "2026-11-17T11:00:00.1Z listening on :3000");
    prod?.push(
      "stderr",
      "2026-11-17T11:00:01Z connect postgresql://u:secret@db:5432/x failed",
    );
    pr?.push(
      "stdout",
      `2026-11-17T11:00:02Z ${"x".repeat(MAX_LINE_CHARS + 50)}`,
    );
    await s.follower.flush();
    const lines = (s.files.get(today) ?? "")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines[0]).toEqual({
      ts: "2026-11-17T11:00:00.100000000Z",
      container: PROD,
      env: "production",
      stream: "stdout",
      line: "listening on :3000",
    });
    expect(lines[1].stream).toBe("stderr");
    expect(lines[1].line).not.toContain("secret");
    expect(lines[1].line).toContain("postgresql://…");
    expect(lines[2].env).toBe("pr-7");
    expect(lines[2].line.length).toBe(
      capLine("x".repeat(MAX_LINE_CHARS + 1)).length,
    );
  });

  test("ignores containers that are not running or not kit-deploy's shape", async () => {
    const s = setup([
      container(PROD, { state: "exited" }),
      container("gaby", { project: "gaby" }),
      container("kd_other-prod-3f2a9c1e7b4d"),
      container(PR, { site: "weird" }),
    ]);
    await s.follower.reconcile();
    expect(s.follower.following()).toEqual([]);
  });

  test("stops following a removed container and follows a restarted one again", async () => {
    const s = setup([container(PROD)]);
    await s.follower.reconcile();
    const first = s.follows[0];
    first?.push("stdout", "2026-11-17T11:00:00Z one");
    s.state.running = [];
    await s.follower.reconcile();
    expect(first?.signal.aborted).toBe(true);
    expect(s.follower.following()).toEqual([]);
    s.state.running = [container(PROD)];
    await s.follower.reconcile();
    expect(s.follows[1]?.since).toBe(
      sinceArg("2026-11-17T11:00:00.000000000Z"),
    );
    // The stream ending (container restarted) frees it for the next reconcile.
    s.follows[1]?.end();
    await Bun.sleep(0);
    expect(s.follower.following()).toEqual([]);
    await s.follower.reconcile();
    expect(s.follows).toHaveLength(3);
  });

  test("resumes after a restart from today's file, without duplicates", async () => {
    const s = setup();
    s.files.set(
      today,
      `${rec("2026-11-17T10:00:00.000000000Z", "a")}\n${rec("2026-11-17T10:00:05.000000000Z", "b")}\n`,
    );
    await s.follower.reconcile();
    const f = s.follows[0];
    expect(f?.since).toBe(sinceArg("2026-11-17T10:00:05.000000000Z"));
    // Docker's since is inclusive: b comes again.
    f?.push("stdout", "2026-11-17T10:00:05Z b");
    f?.push("stdout", "2026-11-17T10:00:06Z c");
    await s.follower.flush();
    const ls = (s.files.get(today) ?? "")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l).line);
    expect(ls).toEqual(["a", "b", "c"]);
  });

  test("resumes from yesterday's file when today has nothing yet", async () => {
    const s = setup();
    s.files.set(
      `${ROOT}/kd_hello/2026-11-16.log.gz`,
      `${rec("2026-11-16T23:59:58.000000000Z", "late")}\n`,
    );
    await s.follower.reconcile();
    expect(s.follows[0]?.since).toBe(
      sinceArg("2026-11-16T23:59:58.000000000Z"),
    );
  });

  test("caps a project's day and says so once", async () => {
    const s = setup();
    s.files.set(today, "x".repeat(MAX_DAY_BYTES - 300));
    await s.follower.reconcile();
    const f = s.follows[0];
    for (let i = 0; i < 10; i++)
      f?.push("stdout", `2026-11-17T11:00:0${i}Z line ${i}`);
    await s.follower.flush();
    f?.push("stdout", "2026-11-17T11:00:59Z after");
    await s.follower.flush();
    const tail = (s.files.get(today) ?? "").slice(MAX_DAY_BYTES - 300);
    expect(tail).toContain("later lines of the day are dropped");
    expect(tail).not.toContain("after");
    expect(tail.match(/dropped/g)).toHaveLength(1);
    expect(s.events.some((e) => e.event === "logs.day_capped")).toBe(true);
  });

  test("rotation: past days gzipped, older than 14 days removed", async () => {
    const s = setup([]);
    const day = (d: string, gz = false) =>
      `${ROOT}/kd_hello/${d}.log${gz ? ".gz" : ""}`;
    s.files.set(day("2026-11-17"), "t\n");
    s.files.set(day("2026-11-16"), "y\n");
    s.files.set(day("2026-11-04", true), "kept\n");
    s.files.set(day("2026-11-03", true), "old\n");
    s.files.set(day("2026-11-01"), "older\n");
    s.files.set(`${ROOT}/kd_hello/notes.txt`, "untouched\n");
    await s.follower.reconcile();
    expect(s.gzipped).toEqual([day("2026-11-16")]);
    expect([...s.files.keys()].sort()).toEqual(
      [
        day("2026-11-04", true),
        day("2026-11-16", true),
        day("2026-11-17"),
        `${ROOT}/kd_hello/notes.txt`,
      ].sort(),
    );
    // Once per day: the next reconcile the same day does not rotate again.
    s.files.set(day("2026-11-15"), "late\n");
    await s.follower.reconcile();
    expect(s.gzipped).toHaveLength(1);
    // The fake clock moves to the next day: today's file becomes yesterday's.
    s.setNow(T0 + 86_400_000);
    await s.follower.reconcile();
    expect(s.gzipped).toContain(day("2026-11-17"));
    expect(addDays("2026-11-18", -13)).toBe("2026-11-05");
    expect(s.files.has(day("2026-11-04", true))).toBe(false);
  });

  test("a failing list is logged, not thrown", async () => {
    const f = fakeLogs();
    const events: Record<string, unknown>[] = [];
    const follower = new LogFollower(
      f.deps,
      async () => {
        throw new Error("docker down");
      },
      (e) => events.push(e),
      () => T0,
    );
    await follower.reconcile();
    expect(events[0]?.event).toBe("logs.list_failed");
  });

  test("stop aborts every follow and writes what is buffered", async () => {
    const s = setup();
    await s.follower.reconcile();
    s.follows[0]?.push("stdout", "2026-11-17T11:00:00Z bye");
    await s.follower.stop();
    expect(s.follows[0]?.signal.aborted).toBe(true);
    expect(s.files.get(today)).toContain("bye");
  });
});

describe("level", () => {
  test("from a JSON level field, else from words", () => {
    expect(levelOf('{"level":50,"msg":"x"}')).toBe("error");
    expect(levelOf('{"level":40}')).toBe("warn");
    expect(levelOf('{"level":"info","msg":"error in name only"}')).toBe("info");
    expect(levelOf('{"severity":"ERROR"}')).toBe("error");
    expect(levelOf("TypeError: x is undefined")).toBe("info");
    expect(levelOf("Unhandled error in route")).toBe("error");
    expect(levelOf("Warning: deprecated")).toBe("warn");
    expect(levelOf("GET / 200")).toBe("info");
  });
});

function withDay(
  f: ReturnType<typeof fakeLogs>,
  day: string,
  lines: string[],
  gz = false,
) {
  f.files.set(
    `${ROOT}/kd_hello/${day}.log${gz ? ".gz" : ""}`,
    lines.map((l) => `${l}\n`).join(""),
  );
}

const ts = (s: number) =>
  `2026-11-17T10:00:${String(s).padStart(2, "0")}.000000000Z`;

describe("logs.tail", () => {
  test("last n lines oldest first, filtered by env and level", async () => {
    const f = fakeLogs();
    withDay(f, "2026-11-17", [
      rec(ts(1), "one"),
      rec(ts(2), "two error", { env: "pr-7", container: PR }),
      rec(ts(3), "three error"),
      "{torn",
      rec(ts(4), "four"),
    ]);
    const all = await tailLogs(f.deps, { project: "kd_hello", lines: 2 }, T0);
    expect(all.entries.map((e) => e.line)).toEqual(["three error", "four"]);
    const prod = await tailLogs(
      f.deps,
      { project: "kd_hello", env: "production", level: "error" },
      T0,
    );
    expect(prod.entries.map((e) => e.line)).toEqual(["three error"]);
    expect(prod.entries[0]?.level).toBe("error");
  });

  test("tops up from yesterday when today is short", async () => {
    const f = fakeLogs();
    withDay(f, "2026-11-16", [rec(ts(1), "y1"), rec(ts(2), "y2")], true);
    withDay(f, "2026-11-17", [rec(ts(3), "t1")]);
    const r = await tailLogs(f.deps, { project: "kd_hello", lines: 2 }, T0);
    expect(r.entries.map((e) => e.line)).toEqual(["y2", "t1"]);
  });

  test("empty when the project has no logs", async () => {
    const f = fakeLogs();
    expect(await tailLogs(f.deps, { project: "kd_none" }, T0)).toEqual({
      entries: [],
    });
  });

  test("bounded in bytes whatever lines says", async () => {
    const f = fakeLogs();
    const big = "z".repeat(MAX_LINE_CHARS);
    withDay(
      f,
      "2026-11-17",
      Array.from({ length: 100 }, (_, i) => rec(ts(i % 60), big)),
    );
    const r = await tailLogs(f.deps, { project: "kd_hello", lines: 500 }, T0);
    expect(JSON.stringify(r).length).toBeLessThan(MAX_RESULT_BYTES + 20_000);
    expect(r.entries.length).toBeLessThan(100);
  });
});

describe("logs.search", () => {
  const day = "2026-11-17";
  const lines = [
    rec(ts(1), "GET /a 200"),
    rec(ts(2), "boom: Error at x"),
    rec(ts(3), "GET /b 200"),
    rec(ts(4), "Another ERROR"),
    rec(ts(5), "literal .* here"),
  ];

  test("literal, case-insensitive, newest first", async () => {
    const f = fakeLogs();
    withDay(f, day, lines);
    const r = await searchLogs(
      f.deps,
      { project: "kd_hello", day, query: "error" },
      T0,
    );
    expect(r.entries.map((e) => e.line)).toEqual([
      "Another ERROR",
      "boom: Error at x",
    ]);
    expect(r.next).toBeNull();
    // Regex characters are just characters.
    const lit = await searchLogs(
      f.deps,
      { project: "kd_hello", day, query: ".*" },
      T0,
    );
    expect(lit.entries.map((e) => e.line)).toEqual(["literal .* here"]);
    const none = await searchLogs(
      f.deps,
      { project: "kd_hello", day, query: "G.T" },
      T0,
    );
    expect(none.entries).toEqual([]);
  });

  test("pages with before", async () => {
    const f = fakeLogs();
    withDay(f, day, lines);
    const p1 = await searchLogs(
      f.deps,
      { project: "kd_hello", day, limit: 2 },
      T0,
    );
    expect(p1.entries.map((e) => e.line)).toEqual([
      "literal .* here",
      "Another ERROR",
    ]);
    expect(p1.next).toBe(3);
    const p2 = await searchLogs(
      f.deps,
      { project: "kd_hello", day, limit: 2, before: p1.next ?? 0 },
      T0,
    );
    expect(p2.entries.map((e) => e.line)).toEqual([
      "GET /b 200",
      "boom: Error at x",
    ]);
    const p3 = await searchLogs(
      f.deps,
      { project: "kd_hello", day, limit: 2, before: p2.next ?? 0 },
      T0,
    );
    expect(p3.entries.map((e) => e.line)).toEqual(["GET /a 200"]);
    expect(p3.next).toBeNull();
  });

  test("reads a gzipped day", async () => {
    const f = fakeLogs();
    withDay(f, "2026-11-10", lines, true);
    const r = await searchLogs(
      f.deps,
      { project: "kd_hello", day: "2026-11-10", query: "GET" },
      T0,
    );
    expect(r.entries).toHaveLength(2);
  });

  test("only the last 14 days", async () => {
    const f = fakeLogs();
    await expect(
      searchLogs(f.deps, { project: "kd_hello", day: "2026-11-03" }, T0),
    ).rejects.toThrow(/outside the kept logs/);
    await expect(
      searchLogs(f.deps, { project: "kd_hello", day: "2026-11-18" }, T0),
    ).rejects.toThrow(/outside/);
    await expect(
      searchLogs(f.deps, { project: "kd_hello", day: "2026-02-30" }, T0),
    ).rejects.toThrow(/invalid day/);
    expect(
      (await searchLogs(f.deps, { project: "kd_hello", day: "2026-11-04" }, T0))
        .entries,
    ).toEqual([]);
  });
});

describe("ops through dispatch", () => {
  function agent() {
    const f = fakeLogs();
    withDay(f, "2026-11-17", [rec(ts(1), "hello")]);
    const d = fakeDeps();
    const a = new Agent(d.deps, () => T0, f.deps);
    return (req: unknown) => dispatch(a, d.deps, JSON.stringify(req));
  }

  test("logs.tail and logs.search answer", async () => {
    const send = agent();
    const t = await send({
      id: "1",
      op: "logs.tail",
      params: { project: "kd_hello" },
    });
    expect(t.ok).toBe(true);
    const s = await send({
      id: "2",
      op: "logs.search",
      params: { project: "kd_hello", day: "2026-11-17", query: "hell" },
    });
    expect(s.ok && (s.result as { entries: unknown[] }).entries).toHaveLength(
      1,
    );
  });

  test("the schema refuses what it should", async () => {
    const send = agent();
    const bad = [
      { op: "logs.tail", params: { project: "../etc" } },
      { op: "logs.tail", params: { project: "kd_hello", lines: 501 } },
      { op: "logs.tail", params: { project: "kd_hello", env: "staging" } },
      { op: "logs.tail", params: { project: "kd_hello", path: "/etc/shadow" } },
      {
        op: "logs.search",
        params: {
          project: "kd_hello",
          day: "2026-11-17",
          query: "x".repeat(201),
        },
      },
      {
        op: "logs.search",
        params: { project: "kd_hello", day: "2026-11-17", query: "a\nb" },
      },
      {
        op: "logs.search",
        params: { project: "kd_hello", day: "2026-11-17", regex: "a.*" },
      },
      { op: "logs.search", params: { project: "kd_hello", day: "../../x" } },
      {
        op: "logs.search",
        params: { project: "kd_hello", day: "2026-11-17", limit: 1001 },
      },
      {
        op: "logs.search",
        params: { project: "kd_hello", day: "2026-11-17", before: -1 },
      },
    ];
    for (const b of bad) {
      const r = await send({ id: "x", ...b });
      expect(r.ok ? "accepted" : r.error.code).toBe("bad_request");
    }
    const old = await send({
      id: "y",
      op: "logs.search",
      params: { project: "kd_hello", day: "2026-10-01" },
    });
    expect(old.ok ? "accepted" : old.error.code).toBe("bad_request");
  });
});

describe("Docker frame decoder", () => {
  const frame = (type: number, text: string) => {
    const payload = Buffer.from(text);
    const h = Buffer.alloc(8);
    h[0] = type;
    h.writeUInt32BE(payload.length, 4);
    return Buffer.concat([h, payload]);
  };

  test("splits streams and lines across chunk boundaries", () => {
    const got: [string, string][] = [];
    const d = frameDecoder((s, l) => got.push([s, l]));
    const all = Buffer.concat([
      frame(1, "2026-11-17T10:00:00Z a\n2026-11-17T10:00:01Z b"),
      frame(2, "2026-11-17T10:00:02Z err\n"),
      frame(1, "-continued\n"),
    ]);
    for (let i = 0; i < all.length; i += 5) d.push(all.subarray(i, i + 5));
    d.end();
    expect(got).toEqual([
      ["stdout", "2026-11-17T10:00:00Z a"],
      ["stderr", "2026-11-17T10:00:02Z err"],
      ["stdout", "2026-11-17T10:00:01Z b-continued"],
    ]);
  });

  test("refuses a stream that is not Docker's", () => {
    const d = frameDecoder(() => {});
    expect(() => d.push(Buffer.from("HTTP/1.1 200 OK\r\n\r\n"))).toThrow();
  });
});

describe("systemLogDeps on a real directory", () => {
  test("append, tail, gzip (twice), read back, list", async () => {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { systemLogDeps: fs } = await import("../../agent/logs-system");
    const dir = join(mkdtempSync(join(tmpdir(), "kd-logs-")), "kd_hello");
    const path = join(dir, "2026-11-16.log");
    await fs.append(path, "a\nb\n");
    expect(await fs.size(path)).toBe(4);
    expect(await fs.readTail(path, 3)).toEqual({ text: "\nb\n", whole: false });
    expect(await fs.readTail(path, 100)).toEqual({
      text: "a\nb\n",
      whole: true,
    });
    await fs.gzip(path);
    await fs.append(path, "c\n");
    await fs.gzip(path);
    const read: string[] = [];
    for await (const l of fs.lines(`${path}.gz`)) read.push(l);
    expect(read).toEqual(["a", "b", "c"]);
    expect(await fs.list(dir, "file")).toEqual(["2026-11-16.log.gz"]);
    expect(await fs.list(join(dir, ".."), "dir")).toEqual(["kd_hello"]);
    const missing: string[] = [];
    for await (const l of fs.lines(join(dir, "nope.log"))) missing.push(l);
    expect(missing).toEqual([]);
    expect(await fs.readTail(join(dir, "nope.log"), 10)).toBeNull();
    expect(await fs.list(join(dir, "nope"), "file")).toEqual([]);
  });
});
