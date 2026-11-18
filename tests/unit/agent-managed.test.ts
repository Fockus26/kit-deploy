import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import type { RunResult } from "../../agent/deps";
import { dispatch } from "../../agent/dispatch";
import { Agent, MASTER_KEY, scrubUrls } from "../../agent/ops";
import type { Response } from "../../agent/protocol";
import type { AgentClient } from "../../cli/client";
import { runCli } from "../../cli/commands";
import { deriveEnvKey, seal } from "../../lib/core/crypto";
import { DB_MARKER_MAX_BYTES, dbMarkerPath } from "../../lib/core/db-marker";
import { fakeDeps } from "./agent-fakes";

const SHA = "3f2a9c1e7b4d5a6f8e9c0b1a2d3e4f5a6b7c8d9e";
const MASTER = randomBytes(32).toString("base64");
const PIN = "/etc/kit-deploy/images/kd_hello";
const PASSWORD = "0f9e8d7c6b5a49382716051423324150";
const url = (db: string) =>
  `postgresql://${db}:${PASSWORD}@db.fockus.dev:6432/${db}?sslmode=verify-full`;

type Handler = (argv: readonly string[]) => Partial<RunResult>;

function setup(
  opts: {
    pinned?: boolean;
    databases?: string[];
    /** Those with kit-deploy's marker (D048); by default every database there. */
    marked?: string[];
    handlers?: Record<string, Handler>;
  } = {},
) {
  const databases = new Set(opts.databases ?? ["kd_hello", "kd_hello_preview"]);
  const marked = opts.marked ?? [...databases];
  const f = fakeDeps({
    "docker run": () => ({ stdout: "abc\n" }),
    "kit-db url": (argv) =>
      databases.has(argv[2] ?? "")
        ? { stdout: `${url(argv[2] ?? "")}\n` }
        : { code: 1, stderr: `kit-db did not create ${argv[2]}.\n` },
    "kit-db create": (argv) => {
      databases.add(argv[2] ?? "");
      return { stdout: `${url(argv[2] ?? "")}\nCreated ${argv[2]}.\n` };
    },
    ...opts.handlers,
  });
  f.files.set(MASTER_KEY, MASTER);
  for (const db of marked) f.files.set(dbMarkerPath(db), "created");
  if (opts.pinned !== false) f.files.set(PIN, "ghcr.io/cesar/kd-hello\n");
  const atRun: (string | null)[] = [];
  const realRun = f.deps.run;
  f.deps.run = async (argv, o) => {
    if (argv[0] === "docker" && argv[1] === "run") {
      const flag = argv.find((a) => a.startsWith("--env-file="));
      atRun.push(
        flag ? (f.files.get(flag.slice("--env-file=".length)) ?? null) : null,
      );
    }
    return realRun(argv, o);
  };
  const agent = new Agent(f.deps);
  const send = (op: string, params: Record<string, unknown>) =>
    dispatch(
      agent,
      f.deps,
      JSON.stringify({ id: "1", op, params }),
    ) as Promise<Response>;
  const run = (params: Record<string, unknown> = {}) =>
    send("container.run", {
      target: { project: "kd_hello", env: "production" },
      sha: SHA,
      image: `ghcr.io/cesar/kd-hello:${SHA}`,
      port: 20417,
      memoryMb: 512,
      ...params,
    });
  const kitDb = () => f.calls.filter((c) => c[0] === "kit-db");
  return { ...f, send, run, atRun, kitDb, databases };
}

describe("DATABASE_URL, managed by the agent", () => {
  test("production: kit-db url <project>, after the project's own variables", async () => {
    const s = setup();
    const v = {
      name: "A",
      secret: true,
      sealed: seal(
        deriveEnvKey(MASTER),
        {
          project: "kd_hello",
          environment: "production",
          name: "A",
          secret: true,
        },
        "1",
      ),
    };
    expect(await s.run({ vars: [v] })).toMatchObject({ ok: true });
    expect(s.kitDb()).toEqual([["kit-db", "url", "kd_hello"]]);
    expect(s.atRun).toEqual([`A=1\nDATABASE_URL=${url("kd_hello")}\n`]);
  });

  test("a preview: <project>_preview, with no variables of its own", async () => {
    const s = setup();
    expect(
      await s.run({ target: { project: "kd_hello", env: "preview", pr: 7 } }),
    ).toMatchObject({ ok: true });
    expect(s.kitDb()).toEqual([["kit-db", "url", "kd_hello_preview"]]);
    expect(s.atRun).toEqual([`DATABASE_URL=${url("kd_hello_preview")}\n`]);
  });

  test("never in the response, argv or logs", async () => {
    const s = setup();
    const res = await s.run();
    const dockerArgv = s.calls.find((c) => c[1] === "run")?.join(" ") ?? "";
    expect(JSON.stringify([res, s.logs, dockerArgv])).not.toContain(PASSWORD);
  });

  test("no pinned repository: kit-db is not even asked", async () => {
    const s = setup({ pinned: false });
    expect(await s.run()).toMatchObject({ ok: true });
    expect(s.kitDb()).toEqual([]);
    expect(s.atRun).toEqual([null]);
  });

  test("an image from another repository: runs, but without the database", async () => {
    const s = setup();
    expect(await s.run({ image: "ghcr.io/attacker/dump:1" })).toMatchObject({
      ok: true,
    });
    expect(s.kitDb()).toEqual([]);
    expect(s.atRun).toEqual([null]);
  });

  test("no database for the project: runs without DATABASE_URL, and says so in the log", async () => {
    // Marked once, gone from kit-db since.
    const s = setup({ databases: [], marked: ["kd_hello"] });
    expect(await s.run()).toMatchObject({ ok: true });
    expect(s.atRun).toEqual([null]);
    expect(s.logs).toContainEqual({
      event: "env.managed",
      database: "kd_hello",
      databaseUrl: false,
    });
  });

  test("D048: a database kit-deploy does not own gives no DATABASE_URL; kit-db is not asked", async () => {
    // `kd_hello` exists on kit-db (another client's, or made by hand) but has no marker.
    const s = setup({ marked: [] });
    expect(await s.run()).toMatchObject({ ok: true });
    expect(s.kitDb()).toEqual([]);
    expect(s.atRun).toEqual([null]);
    expect(s.logs).toContainEqual({
      event: "env.managed",
      database: "kd_hello",
      databaseUrl: false,
      reason: "not_managed",
    });
  });

  test("D048: only a regular file is a marker (a symlink or an oversized file is not)", async () => {
    const link = setup({ marked: [] });
    link.symlinks.set(dbMarkerPath("kd_hello"), MASTER_KEY);
    expect(await link.run()).toMatchObject({ ok: true });
    expect(link.kitDb()).toEqual([]);
    expect(link.atRun).toEqual([null]);

    const big = setup({ marked: [] });
    big.files.set(
      dbMarkerPath("kd_hello"),
      "x".repeat(DB_MARKER_MAX_BYTES + 1),
    );
    expect(await big.run()).toMatchObject({ ok: true });
    expect(big.atRun).toEqual([null]);
  });

  test("D048: a preview uses its own marker, not production's", async () => {
    const s = setup({ marked: ["kd_hello"] });
    expect(
      await s.run({ target: { project: "kd_hello", env: "preview", pr: 7 } }),
    ).toMatchObject({ ok: true });
    expect(s.kitDb()).toEqual([]);
    expect(s.atRun).toEqual([null]);
  });

  test("D048: reserved names are refused by the protocol", async () => {
    const s = setup({ databases: ["kit_deploy", "postgres"] });
    for (const project of [
      "kit_deploy",
      "postgres",
      "template1",
      "pgbouncer",
    ]) {
      expect(
        await s.run({ target: { project, env: "production" } }),
      ).toMatchObject({ ok: false, error: { code: "bad_request" } });
      expect(await s.send("db.create", { project })).toMatchObject({
        ok: false,
        error: { code: "bad_request" },
      });
      expect(await s.send("db.status", { project })).toMatchObject({
        ok: false,
        error: { code: "bad_request" },
      });
    }
    expect(s.kitDb()).toEqual([]);
  });

  test("kit-db output that is not one URL is not used", async () => {
    for (const stdout of [
      "",
      "postgresql://a b\n",
      `${url("kd_hello")}\nsecond line\n`,
      "mysql://x\n",
    ]) {
      const s = setup({ handlers: { "kit-db url": () => ({ stdout }) } });
      expect(await s.run()).toMatchObject({ ok: true });
      expect(s.atRun).toEqual([null]);
    }
  });
});

describe("db.create", () => {
  test("creates both, returns no URL", async () => {
    const s = setup({ databases: [] });
    const res = await s.send("db.create", { project: "kd_hello" });
    expect(res).toEqual({
      id: "1",
      ok: true,
      result: [
        { database: "kd_hello", created: true },
        { database: "kd_hello_preview", created: true },
      ],
    });
    expect(JSON.stringify([res, s.logs])).not.toContain(PASSWORD);
  });

  test("keeps the ones already there (no second password)", async () => {
    const s = setup({ databases: ["kd_hello"] });
    const res = await s.send("db.create", { project: "kd_hello" });
    expect(res).toMatchObject({
      ok: true,
      result: [
        { database: "kd_hello", created: false },
        { database: "kd_hello_preview", created: true },
      ],
    });
    expect(s.kitDb().filter((c) => c[1] === "create")).toEqual([
      ["kit-db", "create", "kd_hello_preview"],
    ]);
  });

  test("D048: marks each one it creates, privately, with no secret inside", async () => {
    const s = setup({ databases: [] });
    expect(await s.send("db.create", { project: "kd_hello" })).toMatchObject({
      ok: true,
    });
    expect(s.privateFiles.map((p) => p.path)).toEqual([
      dbMarkerPath("kd_hello"),
      dbMarkerPath("kd_hello_preview"),
    ]);
    for (const p of s.privateFiles) {
      expect(p.content).toMatch(/^created by kit-deploy \S+\n$/);
      expect(p.content).not.toContain(PASSWORD);
    }
  });

  test("D048: one that exists without the marker is not taken, and nothing is created", async () => {
    // `shop_preview` is new, but `shop` is another client's: neither is touched.
    const s = setup({ databases: ["shop"], marked: [] });
    const res = (await s.send("db.create", { project: "shop" })) as {
      ok: false;
      error: { code: string; message: string };
    };
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe("not_managed");
    expect(res.error.message).toContain("kit-deploy db adopt shop");
    expect(s.kitDb().filter((c) => c[1] === "create")).toEqual([]);
    expect(s.privateFiles).toEqual([]);
  });

  test("a failure says why, without any URL", async () => {
    const s = setup({
      databases: [],
      handlers: {
        "kit-db create": () => ({
          code: 1,
          stderr: `psql: error near ${url("kd_hello")}\n`,
        }),
      },
    });
    const res = (await s.send("db.create", { project: "kd_hello" })) as {
      ok: false;
      error: { code: string; message: string };
    };
    expect(res.error.code).toBe("command_failed");
    expect(res.error.message).toContain("kit-db create kd_hello failed");
    expect(res.error.message).not.toContain(PASSWORD);
  });

  test("protocol refuses a bad project", async () => {
    const s = setup();
    expect(await s.send("db.create", { project: "x; drop" })).toMatchObject({
      ok: false,
      error: { code: "bad_request" },
    });
    expect(s.kitDb()).toEqual([]);
  });

  test("scrubUrls", () => {
    expect(scrubUrls(`a ${url("x")} b postgres://u:p@h/d`)).toBe(
      "a postgresql://… b postgresql://…",
    );
  });
});

describe("kit-deploy db create", () => {
  test("lists what happened, never a URL", async () => {
    const s = setup({ databases: ["kd_hello"] });
    const client: AgentClient = {
      call: (op, params) => s.send(op, params as Record<string, unknown>),
    };
    const r = await runCli(["db", "create", "kd_hello"], client);
    expect(r.code).toBe(0);
    expect(r.out).toContain("kd_hello: already there");
    expect(r.out).toContain("kd_hello_preview: created");
    expect(r.out).not.toContain(PASSWORD);
    expect((await runCli(["db", "create"], client)).code).toBe(2);
    expect((await runCli(["db", "create", "Bad"], client)).code).toBe(2);
  });
});
