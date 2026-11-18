import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dispatch } from "../../agent/dispatch";
import { Agent, MASTER_KEY } from "../../agent/ops";
import { Request, type Response } from "../../agent/protocol";
import type { AgentClient } from "../../cli/client";
import { runCli } from "../../cli/commands";
import type { Sealed } from "../../lib/core/crypto";
import {
  type CronJob,
  type CronRun,
  type StoredSecret,
  tick,
} from "../../lib/cron/run";
import {
  CRON_PATH_RE,
  matches,
  nextRun,
  parseSchedule,
} from "../../lib/cron/schedule";
import type { CronAdmin } from "../../lib/cron/store";
import { fakeDeps } from "./agent-fakes";

const utc = (s: string) => new Date(`${s}Z`);

describe("schedule", () => {
  test.each([
    ["* * * * *", "2026-11-18T12:34:00", true],
    ["*/15 * * * *", "2026-11-18T12:45:00", true],
    ["*/15 * * * *", "2026-11-18T12:46:00", false],
    ["0 3 * * *", "2026-11-18T03:00:00", true],
    ["0 3 * * *", "2026-11-18T04:00:00", false],
    ["30 9 * * 1-5", "2026-11-20T09:30:00", true], // Friday
    ["30 9 * * 1-5", "2026-11-21T09:30:00", false], // Saturday
    ["0 0 * * 7", "2026-11-22T00:00:00", true], // Sunday as 7
    ["0 0 1 * *", "2026-12-01T00:00:00", true],
    // Both day fields restricted: either one (Vixie cron).
    ["0 0 1 * 1", "2026-11-23T00:00:00", true],
    ["0 0 1 * 1", "2026-11-24T00:00:00", false],
    ["5,10-12 * * * *", "2026-11-18T12:11:00", true],
    ["10/20 * * * *", "2026-11-18T12:50:00", true],
  ])("%s at %s → %s", (s, at, want) => {
    expect(matches(parseSchedule(s), utc(at))).toBe(want);
  });

  test.each([
    "* * * *",
    "* * * * * *",
    "60 * * * *",
    "* 24 * * *",
    "* * 0 * *",
    "* * * 13 *",
    "* * * * 8",
    "*/0 * * * *",
    "5-1 * * * *",
    "MON * * * *",
    "@daily",
    "1,,2 * * * *",
  ])("rejects %s", (s) => {
    expect(() => parseSchedule(s)).toThrow();
  });

  test("next run", () => {
    expect(
      nextRun(parseSchedule("0 3 * * *"), utc("2026-11-18T12:34:56")),
    ).toEqual(utc("2026-11-19T03:00:00"));
    expect(
      nextRun(parseSchedule("0 0 31 2 *"), utc("2026-11-18T00:00:00")),
    ).toBeNull();
  });

  test("route paths", () => {
    for (const p of ["/api/cron/daily", "/", "/api/cron/x.y_z~-"])
      expect(CRON_PATH_RE.test(p)).toBe(true);
    for (const p of [
      "api/cron",
      "/a/../b",
      "/x?y=1",
      "/x#y",
      "/x y",
      "//evil.com".repeat(30),
    ])
      expect(CRON_PATH_RE.test(p)).toBe(false);
  });
});

const MASTER = `${randomBytes(32).toString("base64")}\n`;
const SECRET_VALUE = "cron-secret-do-not-leak-0123456789";
const line = (
  name: string,
  state: string,
  project: string,
  env: string,
  port: number,
) =>
  [
    name,
    state,
    "img",
    `${project}-${env}`,
    project,
    env,
    "a".repeat(40),
    String(port),
  ].join("\t");

function agentSetup(ps: string) {
  const f = fakeDeps({ "docker ps": () => ({ stdout: ps }) });
  f.files.set(MASTER_KEY, MASTER);
  const agent = new Agent(f.deps);
  const client: AgentClient = {
    call: (op, params) =>
      dispatch(
        agent,
        f.deps,
        JSON.stringify({ id: "1", op, params }),
      ) as Promise<Response>,
  };
  const seal = async (
    project: string,
    environment = "production",
    name = "CRON_SECRET",
  ) => {
    const r = (await client.call("env.seal", {
      project,
      environment,
      name,
      secret: true,
      value: SECRET_VALUE,
    } as never)) as Response;
    if (!r.ok) throw new Error(r.error.message);
    return { name, secret: true, sealed: r.result as Sealed };
  };
  return { ...f, client, seal };
}

describe("agent: cron.call", () => {
  const PS = [
    line("kd-shop-a", "running", "shop", "production", 20001),
    line("kd-blog-b", "running", "blog", "production", 20002),
    line("kd-shop-pr1", "running", "shop", "pr-1", 20003),
  ].join("\n");

  test("GETs the route on loopback with the bearer; only status and duration come back", async () => {
    const s = agentSetup(PS);
    s.setHttp(200);
    const secret = await s.seal("shop");
    const r = (await s.client.call("cron.call", {
      project: "shop",
      port: 20001,
      path: "/api/cron/daily",
      secret,
    })) as Response;
    expect(r.ok && r.result).toEqual({
      status: 200,
      durationMs: expect.any(Number),
    });
    expect(s.httpCalls.at(-1)).toMatchObject({
      url: "http://127.0.0.1:20001/api/cron/daily",
      headers: { authorization: `Bearer ${SECRET_VALUE}` },
    });
    expect(JSON.stringify(r)).not.toContain(SECRET_VALUE);
    expect(JSON.stringify(s.logs)).not.toContain(SECRET_VALUE);
  });

  test.each([
    ["another project's container", 20002],
    ["the project's preview", 20003],
    ["a port nobody holds", 29999],
  ])("refuses %s", async (_, port) => {
    const s = agentSetup(PS);
    const r = (await s.client.call("cron.call", {
      project: "shop",
      port,
      path: "/api/cron",
      secret: await s.seal("shop"),
    })) as Response;
    expect(r.ok).toBe(false);
    expect(s.httpCalls).toHaveLength(0);
  });

  test("refuses another project's or environment's sealed secret, and other names", async () => {
    const s = agentSetup(PS);
    for (const secret of [
      await s.seal("blog"),
      await s.seal("shop", "preview"),
      await s.seal("shop", "production", "API_KEY"),
    ]) {
      const r = (await s.client.call("cron.call", {
        project: "shop",
        port: 20001,
        path: "/x",
        secret,
      })) as Response;
      expect(r.ok).toBe(false);
    }
    expect(s.httpCalls).toHaveLength(0);
  });

  test("a timeout is a result, not an error", async () => {
    const s = agentSetup(PS);
    const e = new Error("The operation timed out.");
    e.name = "TimeoutError";
    s.setHttp(e);
    const r = (await s.client.call("cron.call", {
      project: "shop",
      port: 20001,
      path: "/x",
      secret: await s.seal("shop"),
    })) as Response;
    expect(r.ok && r.result).toMatchObject({
      status: null,
      error: "no answer in 50 s",
    });
  });

  test("schema: path without query or ..", () => {
    const base = {
      project: "shop",
      port: 20001,
      secret: {
        name: "CRON_SECRET",
        secret: true,
        sealed: { ciphertext: "AAAA", iv: "AAAA", tag: "AAAA", keyVersion: 1 },
      },
    };
    expect(
      Request.safeParse({
        id: "1",
        op: "cron.call",
        params: { ...base, path: "/ok" },
      }).success,
    ).toBe(true);
    for (const path of ["/a?b", "/../x", "x"])
      expect(
        Request.safeParse({
          id: "1",
          op: "cron.call",
          params: { ...base, path },
        }).success,
      ).toBe(false);
  });
});

/** CronAdmin in memory. */
function memoryCron(
  jobs: CronJob[],
  opts: { port?: number | null; secret?: StoredSecret | null } = {},
) {
  const runs: (CronRun & { slotKey: string })[] = [];
  const audits: unknown[] = [];
  let n = 0;
  const store: CronAdmin = {
    jobs: async (p) => jobs.filter((j) => !p || j.project === p),
    runs: async (p, limit, jobId) =>
      runs
        .filter((r) => r.project === p && (!jobId || r.jobId === jobId))
        .reverse()
        .slice(0, limit),
    claim: async (jobId, slot, now) => {
      const key = `${jobId}@${slot.toISOString()}`;
      if (runs.some((r) => r.slotKey === key)) return null;
      const job = jobs.find((j) => j.id === jobId);
      const id = `run${++n}`;
      runs.push({
        id,
        jobId,
        slotKey: key,
        project: job?.project ?? "",
        path: job?.path ?? "",
        scheduledFor: slot,
        startedAt: now,
        finishedAt: null,
        status: "running",
        httpStatus: null,
        durationMs: null,
        error: null,
      });
      return id;
    },
    finish: async (id, r, now) => {
      const run = runs.find((x) => x.id === id);
      if (run) Object.assign(run, r, { finishedAt: now });
    },
    livePort: async () => (opts.port === undefined ? 20001 : opts.port),
    cronSecret: async () =>
      opts.secret === undefined
        ? {
            name: "CRON_SECRET",
            secret: true,
            sealed: {
              ciphertext: "AAAA",
              iv: "AAAA",
              tag: "AAAA",
              keyVersion: 1,
            },
          }
        : opts.secret,
    pruneRuns: async () => {},
    add: async (project, path, schedule, audit) => {
      audits.push(audit);
      const j = {
        id: `0123456789ab${jobs.length}`,
        project,
        path,
        schedule,
        enabled: true,
        createdAt: new Date(),
      };
      jobs.push(j);
      return j;
    },
    remove: async (project, id, audit) => {
      audits.push(audit);
      const i = jobs.findIndex((j) => j.id === id && j.project === project);
      if (i < 0) return false;
      jobs.splice(i, 1);
      return true;
    },
    setEnabled: async (project, id, enabled, audit) => {
      audits.push(audit);
      const j = jobs.find((x) => x.id === id && x.project === project);
      if (j) j.enabled = enabled;
      return Boolean(j);
    },
  };
  return { store, runs, audits };
}

const job = (over: Partial<CronJob> = {}): CronJob => ({
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  project: "shop",
  path: "/api/cron/daily",
  schedule: "0 3 * * *",
  enabled: true,
  createdAt: new Date(0),
  ...over,
});

function agentAnswering(
  result: unknown,
  ok = true,
): AgentClient & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    call: async (op, params) => {
      calls.push({ op, params });
      return ok
        ? ({ id: "1", ok: true, result } as Response)
        : ({
            id: "1",
            ok: false,
            error: { code: "bad_request", message: "nope" },
          } as Response);
    },
  };
}

describe("tick", () => {
  const at3 = () => Date.parse("2026-11-18T03:00:07Z");

  test("runs the matching jobs once per minute and logs status and duration", async () => {
    const m = memoryCron([
      job(),
      job({ id: "b", schedule: "0 4 * * *" }),
      job({ id: "c", enabled: false }),
    ]);
    const agent = agentAnswering({ status: 204, durationMs: 120 });
    const r = await tick({ store: m.store, agent, now: at3 });
    expect(r.lines).toEqual([
      {
        project: "shop",
        path: "/api/cron/daily",
        status: "ok",
        httpStatus: 204,
        durationMs: 120,
        error: null,
      },
    ]);
    expect(m.runs[0]?.scheduledFor).toEqual(new Date("2026-11-18T03:00:00Z"));
    // A second tick in the same minute does nothing.
    expect((await tick({ store: m.store, agent, now: at3 })).lines).toEqual([]);
    expect(agent.calls).toHaveLength(1);
  });

  test("a 500, no answer, no CRON_SECRET, nothing live: failed runs with the reason", async () => {
    const cases: [ReturnType<typeof memoryCron>, AgentClient, string][] = [
      [
        memoryCron([job()]),
        agentAnswering({ status: 500, durationMs: 5 }),
        "HTTP 500",
      ],
      [
        memoryCron([job()]),
        agentAnswering({
          status: null,
          durationMs: 50000,
          error: "no answer in 50 s",
        }),
        "no answer in 50 s",
      ],
      [
        memoryCron([job()], { secret: null }),
        agentAnswering({}),
        "CRON_SECRET is not set in production",
      ],
      [
        memoryCron([job()], { port: null }),
        agentAnswering({}),
        "no live production container",
      ],
      [
        memoryCron([job()]),
        agentAnswering({}, false),
        "kit-agent: bad_request: nope",
      ],
    ];
    for (const [m, agent, why] of cases) {
      const r = await tick({ store: m.store, agent, now: at3 });
      expect(r.lines[0]?.status).toBe("failed");
      expect(r.lines[0]?.error).toContain(why);
      expect(m.runs[0]?.status).toBe("failed");
    }
  });

  test("a stored schedule that no longer parses is skipped with a warning", async () => {
    const m = memoryCron([job({ schedule: "bad" })]);
    const r = await tick({
      store: m.store,
      agent: agentAnswering({}),
      now: at3,
    });
    expect(r.lines).toEqual([]);
    expect(r.skipped[0]).toContain("shop /api/cron/daily");
  });
});

describe("kit-deploy cron", () => {
  const now = () => Date.parse("2026-11-18T12:00:00Z");
  const agent = agentAnswering({ status: 200, durationMs: 42 });

  test("add validates, audits, says the next run, warns without CRON_SECRET", async () => {
    const m = memoryCron([], { secret: null });
    const ctx = { cron: () => m.store, actor: "ssh:cesar", now };
    expect(
      (await runCli(["cron", "add", "shop", "api/x", "* * * * *"], agent, ctx))
        .code,
    ).toBe(2);
    expect(
      (await runCli(["cron", "add", "shop", "/x", "61 * * * *"], agent, ctx))
        .err,
    ).toContain("invalid schedule");
    const r = await runCli(
      ["cron", "add", "shop", "/api/cron/daily", "0", "3", "*", "*", "*"],
      agent,
      ctx,
    );
    expect(r.code).toBe(0);
    expect(r.out).toBe(
      'added 01234567: GET /api/cron/daily on "0 3 * * *" (UTC), next 2026-11-19 03:00\n',
    );
    expect(r.err).toContain("env set shop production CRON_SECRET");
    expect(m.audits).toEqual([
      {
        actor: "ssh:cesar",
        action: "cron.add",
        project: "shop",
        environment: "production",
        name: "/api/cron/daily 0 3 * * *",
      },
    ]);
  });

  test("ls, pause, run, runs, rm by id prefix", async () => {
    const m = memoryCron([job()]);
    const ctx = { cron: () => m.store, actor: "ssh:cesar", now };
    expect((await runCli(["cron", "ls", "shop"], agent, ctx)).out).toBe(
      "ID        SCHEDULE (UTC)  NEXT              PATH\naaaaaaaa  0 3 * * *       2026-11-19 03:00  /api/cron/daily\n",
    );
    expect(
      (await runCli(["cron", "pause", "shop", "aaaaaa"], agent, ctx)).out,
    ).toBe("paused aaaaaaaa (/api/cron/daily)\n");
    expect((await runCli(["cron", "ls", "shop"], agent, ctx)).out).toContain(
      "paused",
    );
    const run = await runCli(["cron", "run", "shop", "aaaaaaaa"], agent, ctx);
    expect(run).toEqual({
      code: 0,
      out: "ok /api/cron/daily 200 42ms\n",
      err: "",
    });
    expect((await runCli(["cron", "runs", "shop"], agent, ctx)).out).toContain(
      "/api/cron/daily  ok      200   42",
    );
    expect(
      (await runCli(["cron", "rm", "shop", "aaaaaaaa"], agent, ctx)).out,
    ).toBe("removed aaaaaaaa (/api/cron/daily)\n");
    expect(
      (await runCli(["cron", "rm", "shop", "aaaaaaaa"], agent, ctx)).code,
    ).toBe(1);
  });

  test("tick prints one line per run", async () => {
    const m = memoryCron([job({ schedule: "* * * * *" })]);
    const r = await runCli(["cron", "tick"], agent, {
      cron: () => m.store,
      now,
    });
    expect(r.out).toBe("ok shop /api/cron/daily 200 42ms\n");
  });
});

describe("kit-deploy-cron.{service,timer}", () => {
  const read = (f: string) => readFileSync(f, "utf8");
  test("at :00 of every minute, oneshot, under a minute, shipped and installed", () => {
    expect(read("infra/kit-deploy-cron.timer")).toMatch(
      /^OnCalendar=\*-\*-\* \*:\*:00$/m,
    );
    const svc = read("infra/kit-deploy-cron.service");
    expect(svc).toMatch(/^ExecStart=\/usr\/local\/bin\/kit-deploy cron tick$/m);
    expect(svc).toMatch(/^TimeoutStartSec=58s$/m);
    for (const u of ["kit-deploy-cron.service", "kit-deploy-cron.timer"])
      expect(read("scripts/release.sh")).toContain(`infra/${u}`);
    expect(read("infra/update.sh")).toContain("install_timer kit-deploy-cron");
  });
});
