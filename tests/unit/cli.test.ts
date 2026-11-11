import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agent } from "../../agent/ops";
import type { Response } from "../../agent/protocol";
import { serve } from "../../agent/server";
import {
  type AgentClient,
  AgentUnreachable,
  socketClient,
} from "../../cli/client";
import { CLI_VERSION, runCli, summarize, table } from "../../cli/commands";
import { fakeDeps } from "./agent-fakes";

const SHA_A = "3f2a9c1e7b4d5a6f8e9c0b1a2d3e4f5a6b7c8d9e";
const SHA_B = "aaaaaaaaaaaabbbbbbbbbbbbccccccccccccdddd";

const containers = [
  {
    name: "kd_hello-prod-3f2a9c1e7b4d",
    state: "running",
    image: "ghcr.io/c/kd-hello:a",
    site: "kd_hello",
    project: "kd_hello",
    env: "production",
    sha: SHA_A,
    port: 20417,
  },
  {
    name: "kd_hello-prod-aaaaaaaaaaaa",
    state: "exited",
    image: "ghcr.io/c/kd-hello:b",
    site: "kd_hello",
    project: "kd_hello",
    env: "production",
    sha: SHA_B,
    port: 20500,
  },
];

/** A client that answers from a table and records what it was asked. */
function fakeClient(
  answers: Partial<Record<string, (params: unknown) => Response>>,
) {
  const calls: { op: string; params: unknown }[] = [];
  const client: AgentClient = {
    async call(op, params) {
      calls.push({ op, params });
      const a = answers[op];
      if (!a) throw new Error(`unexpected op ${op}`);
      return a(params);
    },
  };
  return { client, calls };
}

const okRes = (result: unknown): Response => ({ id: "x", ok: true, result });

describe("kit-deploy version", () => {
  test("prints both versions", async () => {
    const { client } = fakeClient({
      version: () => okRes({ version: "0.1.0" }),
    });
    expect(await runCli(["version"], client)).toEqual({
      code: 0,
      out: `kit-deploy ${CLI_VERSION}\nkit-agent 0.1.0\n`,
      err: "",
    });
  });

  test("agent down: still prints the CLI's, exits 1", async () => {
    const client: AgentClient = {
      async call() {
        throw new AgentUnreachable("cannot reach kit-agent at /x: ENOENT");
      },
    };
    const r = await runCli(["version"], client);
    expect(r.code).toBe(1);
    expect(r.out).toContain("kit-agent unreachable");
    expect(r.err).toContain("ENOENT");
  });

  test("--json", async () => {
    const { client } = fakeClient({
      version: () => okRes({ version: "0.1.0" }),
    });
    const r = await runCli(["version", "--json"], client);
    expect(JSON.parse(r.out)).toEqual({ cli: CLI_VERSION, agent: "0.1.0" });
  });
});

describe("kit-deploy list", () => {
  test("one row per site, the running container first", async () => {
    const { client } = fakeClient({
      "container.list": () => okRes(containers),
    });
    const r = await runCli(["list"], client);
    expect(r.code).toBe(0);
    expect(r.out).toBe(
      table(
        ["SITE", "ENV", "STATE", "SHA", "PORT", "KEPT"],
        [["kd_hello", "production", "running", "3f2a9c1e7b4d", "20417", "2"]],
      ),
    );
  });

  test("empty", async () => {
    const { client } = fakeClient({ "container.list": () => okRes([]) });
    expect((await runCli(["list"], client)).out).toBe("no sites yet\n");
  });

  test("an agent error is printed and exits 1", async () => {
    const { client } = fakeClient({
      "container.list": () => ({
        id: "x",
        ok: false,
        error: { code: "command_failed", message: "docker ps failed" },
      }),
    });
    expect(await runCli(["list"], client)).toEqual({
      code: 1,
      out: "",
      err: "command_failed: docker ps failed\n",
    });
  });

  test("summarize falls back to the newest container when none runs", () => {
    const stopped = containers.map((c) => ({ ...c, state: "exited" }));
    expect(summarize(stopped)[0]).toMatchObject({
      state: "exited",
      sha: "3f2a9c1e7b4d",
      kept: 2,
    });
  });
});

describe("kit-deploy status", () => {
  test("health-checks only the running container", async () => {
    const { client, calls } = fakeClient({
      "container.list": () => okRes(containers),
      "health.check": () => okRes({ ok: true, status: 200 }),
    });
    const r = await runCli(["status", "kd_hello"], client);
    expect(r.code).toBe(0);
    expect(r.out).toContain(
      "kd_hello-prod-3f2a9c1e7b4d  production  running  20417  ok (200)",
    );
    expect(r.out).toContain(
      "kd_hello-prod-aaaaaaaaaaaa  production  exited   20500  -",
    );
    expect(calls).toEqual([
      { op: "container.list", params: { project: "kd_hello" } },
      { op: "health.check", params: { port: 20417 } },
    ]);
  });

  test("a site that does not answer", async () => {
    const { client } = fakeClient({
      "container.list": () => okRes([containers[0]]),
      "health.check": () => okRes({ ok: false, status: null }),
    });
    expect((await runCli(["status", "kd_hello"], client)).out).toContain(
      "down (no answer)",
    );
  });

  test.each([
    [[]],
    [["status"]],
    [["status", "../x"]],
    [["status", "KD"]],
  ])("usage errors exit 2 without asking the agent: %p", async (argv) => {
    const { client, calls } = fakeClient({});
    const r = await runCli(argv.length ? argv : ["status"], client);
    expect(r.code).toBe(2);
    expect(calls).toEqual([]);
  });
});

describe("help and unknown commands", () => {
  test("help", async () => {
    const { client } = fakeClient({});
    const r = await runCli([], client);
    expect(r.code).toBe(0);
    expect(r.out).toContain("Usage: kit-deploy");
  });

  test("an unknown command exits 2", async () => {
    const { client } = fakeClient({});
    const r = await runCli(["deploy", "kd_hello"], client);
    expect(r.code).toBe(2);
    expect(r.err).toContain('unknown command "deploy"');
  });
});

describe("socketClient", () => {
  test("a missing socket is AgentUnreachable with a hint", async () => {
    const path =
      process.platform === "win32"
        ? "\\\\.\\pipe\\kit-agent-missing-test"
        : join(tmpdir(), "kit-agent-missing.sock");
    await expect(socketClient(path).call("version", {})).rejects.toThrow(
      AgentUnreachable,
    );
  });

  // node:net unix sockets need a POSIX host; CI (Linux) runs this.
  test.skipIf(process.platform === "win32")(
    "round trip against the real server",
    async () => {
      const path = join(mkdtempSync(join(tmpdir(), "kit-cli-")), "agent.sock");
      const f = fakeDeps();
      const server = await serve(new Agent(f.deps), f.deps, {
        path,
        gid: null,
      });
      try {
        const r = await runCli(["version"], socketClient(path));
        expect(r).toMatchObject({
          code: 0,
          out: `kit-deploy ${CLI_VERSION}\nkit-agent 0.1.0\n`,
        });
      } finally {
        server.close();
      }
    },
  );
});
