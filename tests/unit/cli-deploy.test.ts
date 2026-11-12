import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type CliContext, runCli } from "../../cli/commands";
import { loadCliEnv, parseEnvFile } from "../../cli/env";
import type { DeploymentRef, DeployStore } from "../../lib/db/store";
import {
  at,
  deps,
  fakeAgent,
  memoryRepo,
  name,
  ok,
  type Row,
  sha,
} from "./deploy-fakes";

/** The API's store over the same rows the switch's memory repo uses. */
function rowsStore(rows: Row[]): DeployStore {
  return {
    async findTokenProject() {
      return null;
    },
    async touchToken() {},
    async findOpenDeployment(_p, s) {
      const r = rows.find(
        (x) => x.sha === s && ["queued", "starting", "live"].includes(x.status),
      );
      return r ? { id: r.id, status: r.status, image: "x" } : null;
    },
    async createDeployment(d) {
      const id = `n${rows.length}`;
      rows.push({
        id,
        sha: d.sha,
        status: "queued",
        container: null,
        port: null,
        createdAt: at(50),
      });
      const ref: DeploymentRef = { id, status: "queued", image: d.image };
      return ref;
    },
  };
}

function cli(rows: Row[], agentOverrides = {}) {
  const { agent, ops, calls } = fakeAgent(agentOverrides);
  const { d } = deps(agent, memoryRepo(rows));
  let t = 0;
  const ctx: CliContext = {
    deploy: () => ({ switch: d, store: rowsStore(rows) }),
    now: () => (t += 1_500),
  };
  return { run: (argv: string[]) => runCli(argv, agent, ctx), ops, calls };
}

describe("kit-deploy deploy", () => {
  test("queues the commit and runs the switch", async () => {
    const rows: Row[] = [
      {
        id: "old",
        sha: sha("a"),
        status: "live",
        container: name("a"),
        port: 20400,
        createdAt: at(1),
      },
    ];
    const { run, ops, calls } = cli(rows);
    const r = await run(["deploy", "kd_hello", sha("b")]);
    expect(r).toEqual({
      code: 0,
      out: `queued n1 (${"b".repeat(12)})\nlive n1\n`,
      err: "",
    });
    expect(ops()[0]).toBe("image.pull");
    expect(calls[0]?.params).toEqual({
      image: `ghcr.io/fockus26/kd-hello:${sha("b")}`,
    });
  });

  test("without a commit it runs what is queued, or says nothing is", async () => {
    const { run } = cli([]);
    expect((await run(["deploy", "kd_hello"])).out).toBe(
      "nothing queued for kd_hello\n",
    );
  });

  test("a failed switch exits 1 with the reason", async () => {
    const { run } = cli([], {
      "image.pull": () => ({
        id: "x",
        ok: false,
        error: { code: "command_failed", message: "manifest unknown" },
      }),
    });
    const r = await run(["deploy", "kd_hello", sha("c")]);
    expect(r.code).toBe(1);
    expect(r.out).toContain(
      "failed n0: image.pull: command_failed: manifest unknown",
    );
  });

  test.each([
    [["deploy"]],
    [["deploy", "KD"]],
    [["deploy", "kd_hello", "abc123"]],
    [["deploy", "kd_hello", sha("A")]],
    [["rollback"]],
    [["rollback", "../x"]],
  ])("usage errors exit 2: %p", async (argv) => {
    const { run, ops } = cli([]);
    expect((await run(argv)).code).toBe(2);
    expect(ops()).toEqual([]);
  });

  test("an unknown project exits 1", async () => {
    const { run } = cli([]);
    expect(await run(["deploy", "nope"])).toMatchObject({
      code: 1,
      err: "no project nope\n",
    });
  });
});

describe("kit-deploy rollback", () => {
  test("prints from, to and how long it took", async () => {
    const rows: Row[] = [
      {
        id: "d1",
        sha: sha("a"),
        status: "superseded",
        container: name("a"),
        port: 20400,
        createdAt: at(1),
      },
      {
        id: "d2",
        sha: sha("b"),
        status: "live",
        container: name("b"),
        port: 20401,
        createdAt: at(2),
      },
    ];
    const { run } = cli(rows);
    expect(await run(["rollback", "kd_hello"])).toEqual({
      code: 0,
      out: "rolled back kd_hello: d2 -> d1 in 1.5s\n",
      err: "",
    });
  });

  test("nothing to go back to: exit 1 with the reason", async () => {
    const { run } = cli([]);
    const r = await run(["rollback", "kd_hello"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("no earlier deployment");
  });
});

describe("kit-deploy regenerate", () => {
  test("one line per live site", async () => {
    const rows: Row[] = [
      {
        id: "d1",
        sha: sha("a"),
        status: "live",
        container: name("a"),
        port: 20400,
        createdAt: at(1),
      },
    ];
    const { run } = cli(rows, {
      "container.list": () => ok([{ name: name("a"), state: "running" }]),
    });
    expect(await run(["regenerate"])).toEqual({
      code: 0,
      out: "ok kd_hello\n",
      err: "",
    });
  });

  test("without the database the command says so", async () => {
    const { agent } = fakeAgent();
    const r = await runCli(["regenerate"], agent, {});
    expect(r).toMatchObject({
      code: 1,
      err: "this command needs the database\n",
    });
  });
});

describe("cli.env", () => {
  test("only DATABASE_URL is taken; quotes and comments are handled", () => {
    expect(
      parseEnvFile(
        '# kit-deploy\nDATABASE_URL="postgres://u:p@h/db"\nOTHER=x\n=bad\n',
      ),
    ).toEqual({ DATABASE_URL: "postgres://u:p@h/db" });
  });

  test("fills only what the environment does not set; a missing file is fine", () => {
    const dir = mkdtempSync(join(tmpdir(), "kit-cli-env-"));
    const file = join(dir, "cli.env");
    writeFileSync(file, "DATABASE_URL=postgres://from-file/db\n");
    const empty: Record<string, string | undefined> = {};
    loadCliEnv(file, empty);
    expect(empty.DATABASE_URL).toBe("postgres://from-file/db");
    const set: Record<string, string | undefined> = {
      DATABASE_URL: "postgres://env/db",
    };
    loadCliEnv(file, set);
    expect(set.DATABASE_URL).toBe("postgres://env/db");
    const none: Record<string, string | undefined> = {};
    loadCliEnv(join(dir, "missing.env"), none);
    expect(none).toEqual({});
  });
});
