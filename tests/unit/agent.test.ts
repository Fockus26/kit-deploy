import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dispatch } from "../../agent/dispatch";
import {
  Agent,
  parseContainerList,
  parseListeningPorts,
  RESERVATION_MS,
} from "../../agent/ops";
import { MAX_REQUEST_BYTES } from "../../agent/protocol";
import { serve } from "../../agent/server";
import { fakeDeps } from "./agent-fakes";

const SHA = "3f2a9c1e7b4d5a6f8e9c0b1a2d3e4f5a6b7c8d9e";
const prod = { project: "kd_hello", env: "production" } as const;
const SITE = "/etc/caddy/sites/kd_hello.caddy";

function setup(handlers?: Parameters<typeof fakeDeps>[0], now?: () => number) {
  const f = fakeDeps(handlers);
  const agent = new Agent(f.deps, now);
  const send = (req: unknown) =>
    dispatch(
      agent,
      f.deps,
      typeof req === "string" ? req : JSON.stringify(req),
    );
  return { ...f, agent, send };
}

describe("protocol", () => {
  test("version", async () => {
    const { send } = setup();
    expect(await send({ id: "1", op: "version", params: {} })).toEqual({
      id: "1",
      ok: true,
      result: { version: "0.1.0" },
    });
  });

  test.each([
    ["not JSON", "{nope"],
    ["an unknown op", { id: "1", op: "shell.exec", params: { cmd: "id" } }],
    ["an unknown param", { id: "1", op: "version", params: { x: 1 } }],
    [
      "an extra top-level key",
      { id: "1", op: "version", params: {}, sudo: true },
    ],
    [
      "a bad container name",
      { id: "1", op: "container.stop", params: { name: "gaby" } },
    ],
    [
      "a port outside D016",
      { id: "1", op: "health.check", params: { port: 5432 } },
    ],
    [
      "a health path that leaves the host",
      {
        id: "1",
        op: "health.check",
        params: { port: 20000, path: "@evil.dev/" },
      },
    ],
    ["a bad id", { id: "a b", op: "version", params: {} }],
    [
      "an image outside GHCR",
      { id: "1", op: "image.pull", params: { image: "evil.dev/x:1" } },
    ],
    [
      "a flag as image",
      { id: "1", op: "image.pull", params: { image: "--privileged" } },
    ],
    [
      "a platform host",
      {
        id: "1",
        op: "site.write",
        params: {
          target: { project: "kd_hello", env: "production" },
          hosts: ["DB.fockus.dev"],
          port: 20000,
        },
      },
    ],
  ])("rejects %s with bad_request and runs nothing", async (_, req) => {
    const { send, calls } = setup();
    const res = await send(req);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("bad_request");
    expect(calls).toEqual([]);
  });

  test("lib/core's checks stop what zod lets through", async () => {
    const { send, calls } = setup();
    const res = await send({
      id: "1",
      op: "container.run",
      params: {
        target: prod,
        sha: SHA,
        image: "ghcr.io/a b",
        port: 20000,
        memoryMb: 512,
      },
    });
    expect(res).toMatchObject({ ok: false, error: { code: "bad_request" } });
    expect(calls).toEqual([]);
  });

  test("an unexpected error is logged but not leaked", async () => {
    const f = fakeDeps();
    f.deps.run = async () => {
      throw new Error("ENOENT /secret/path");
    };
    const agent = new Agent(f.deps);
    const res = await dispatch(
      agent,
      f.deps,
      JSON.stringify({
        id: "9",
        op: "image.pull",
        params: { image: "ghcr.io/a/b:1" },
      }),
    );
    expect(res).toEqual({
      id: "9",
      ok: false,
      error: { code: "internal", message: "internal error" },
    });
    expect(JSON.stringify(f.logs)).toContain("ENOENT");
  });
});

describe("containers", () => {
  test("container.run runs lib/core's args", async () => {
    const { send, calls } = setup({
      "docker run": () => ({ stdout: "abc123\n" }),
    });
    const res = await send({
      id: "1",
      op: "container.run",
      params: {
        target: prod,
        sha: SHA,
        image: `ghcr.io/cesar/kd-hello:${SHA}`,
        port: 20417,
        memoryMb: 512,
      },
    });
    expect(res).toEqual({
      id: "1",
      ok: true,
      result: { name: "kd_hello-prod-3f2a9c1e7b4d", id: "abc123" },
    });
    expect(calls[0]?.slice(0, 3)).toEqual(["docker", "run", "--detach"]);
    expect(calls[0]).toContain("--publish=127.0.0.1:20417:3000");
  });

  test("stop refuses a container without kit-deploy's label", async () => {
    const { send, calls } = setup({
      "docker inspect": () => ({ stdout: "\n" }),
    });
    const res = await send({
      id: "1",
      op: "container.stop",
      params: { name: "kd_hello-prod-3f2a9c1e7b4d" },
    });
    expect(res).toMatchObject({ ok: false, error: { code: "not_managed" } });
    expect(calls.map((c) => c[1])).toEqual(["inspect"]);
  });

  test("stop and remove a managed container", async () => {
    const { send, calls } = setup({
      "docker inspect": () => ({ stdout: "1\n" }),
    });
    const name = "kd_hello-prod-3f2a9c1e7b4d";
    expect(
      (await send({ id: "1", op: "container.stop", params: { name } })).ok,
    ).toBe(true);
    expect(
      (await send({ id: "2", op: "container.remove", params: { name } })).ok,
    ).toBe(true);
    expect(calls.filter((c) => c[1] !== "inspect")).toEqual([
      ["docker", "stop", "--time=10", name],
      ["docker", "rm", name],
    ]);
  });

  test("a failed command reports its stderr", async () => {
    const { send } = setup({
      "docker pull": () => ({ code: 1, stderr: "manifest unknown\n" }),
    });
    const res = await send({
      id: "1",
      op: "image.pull",
      params: { image: "ghcr.io/a/b:1" },
    });
    expect(res).toMatchObject({ ok: false, error: { code: "command_failed" } });
    if (!res.ok) expect(res.error.message).toContain("manifest unknown");
  });

  test("container.list parses docker ps and filters by project", async () => {
    const line = [
      "kd_hello-prod-3f2a9c1e7b4d",
      "running",
      "ghcr.io/cesar/kd-hello:1",
      "kd_hello",
      "kd_hello",
      "production",
      SHA,
      "20417",
    ].join("\t");
    const { send, calls } = setup({
      "docker ps": () => ({ stdout: `${line}\n` }),
    });
    const res = await send({
      id: "1",
      op: "container.list",
      params: { project: "kd_hello" },
    });
    expect(res).toMatchObject({
      ok: true,
      result: [
        {
          name: "kd_hello-prod-3f2a9c1e7b4d",
          state: "running",
          port: 20417,
          env: "production",
        },
      ],
    });
    expect(calls[0]).toContain("--filter=label=dev.fockus.kit-deploy=1");
    expect(calls[0]).toContain(
      "--filter=label=dev.fockus.kit-deploy.project=kd_hello",
    );
  });
});

describe("ports.allocate", () => {
  test("skips listening ports, managed containers' ports and fresh reservations", async () => {
    let now = 1_000;
    const { send } = setup(
      {
        ss: () => ({ stdout: "LISTEN 0 4096 127.0.0.1:20001 0.0.0.0:*\n" }),
        "docker ps": () => ({
          stdout: "x\texited\ti\ts\tp\tproduction\tabc1234\t20002\n",
        }),
      },
      () => now,
    );
    const req = (sha: string) => ({
      id: "1",
      op: "ports.allocate",
      params: { target: prod, sha },
    });
    const a = await send(req("aaaaaaa"));
    const b = await send(req("aaaaaaa"));
    if (!a.ok || !b.ok) throw new Error("allocate failed");
    const pa = (a.result as { port: number }).port;
    const pb = (b.result as { port: number }).port;
    expect([20001, 20002]).not.toContain(pa);
    expect(pb).not.toBe(pa); // same key, but the first one is reserved
    now += RESERVATION_MS + 1;
    const c = await send(req("aaaaaaa"));
    if (!c.ok) throw new Error("allocate failed");
    expect((c.result as { port: number }).port).toBe(pa); // reservation expired
  });

  test("parseListeningPorts reads IPv4, IPv6 and wildcard addresses", () => {
    const out = [
      "LISTEN 0 4096 127.0.0.1:20417 0.0.0.0:*",
      "LISTEN 0 128 [::]:22 [::]:*",
      "LISTEN 0 511 *:443 *:*",
      "",
    ].join("\n");
    expect([...parseListeningPorts(out)].sort()).toEqual(
      [20417, 22, 443].sort(),
    );
  });

  test("parseContainerList tolerates a missing port label", () => {
    expect(
      parseContainerList("n\trunning\ti\ts\tp\tproduction\tabc\t\n")[0]?.port,
    ).toBeNull();
  });
});

describe("sites", () => {
  const write = (port = 20417) => ({
    id: "1",
    op: "site.write",
    params: { target: prod, hosts: ["hello.fockus.dev"], port },
  });

  test("writes, validates, reloads", async () => {
    const { send, calls, files } = setup();
    expect(await send(write())).toMatchObject({
      ok: true,
      result: { path: SITE, changed: true },
    });
    expect(files.get(SITE)).toContain("reverse_proxy 127.0.0.1:20417");
    expect(calls.map((c) => c.slice(0, 2).join(" "))).toEqual([
      "caddy validate",
      "caddy reload",
    ]);
  });

  test("an identical file does not reload Caddy", async () => {
    const { send, calls } = setup();
    await send(write());
    calls.length = 0;
    expect(await send(write())).toMatchObject({
      ok: true,
      result: { changed: false },
    });
    expect(calls).toEqual([]);
  });

  test("an invalid config puts the previous file back and does not reload", async () => {
    let fail = false;
    const { send, calls, files } = setup({
      "caddy validate": () => (fail ? { code: 1, stderr: "bad" } : {}),
    });
    await send(write(20417));
    const before = files.get(SITE);
    fail = true;
    calls.length = 0;
    expect(await send(write(20418))).toMatchObject({
      ok: false,
      error: { code: "invalid_config" },
    });
    expect(files.get(SITE)).toBe(before);
    expect(calls.map((c) => c[1])).toEqual(["validate"]);
  });

  test("a new site that fails validation leaves no file", async () => {
    const { send, files } = setup({ "caddy validate": () => ({ code: 1 }) });
    await send(write());
    expect(files.has(SITE)).toBe(false);
  });

  test("a failed reload restores the previous file", async () => {
    const { send, files } = setup({
      "caddy reload": () => ({ code: 1, stderr: "admin down" }),
    });
    expect(await send(write())).toMatchObject({
      ok: false,
      error: { code: "command_failed" },
    });
    expect(files.has(SITE)).toBe(false);
  });

  test("site.remove removes and reloads; a missing site is a no-op", async () => {
    const { send, calls, files } = setup();
    await send(write());
    calls.length = 0;
    const rm = { id: "2", op: "site.remove", params: { target: prod } };
    expect(await send(rm)).toMatchObject({
      ok: true,
      result: { removed: true },
    });
    expect(files.has(SITE)).toBe(false);
    expect(calls.map((c) => c[1])).toEqual(["validate", "reload"]);
    calls.length = 0;
    expect(await send(rm)).toMatchObject({
      ok: true,
      result: { removed: false },
    });
    expect(calls).toEqual([]);
  });

  test("mutations run one at a time", async () => {
    const order: string[] = [];
    const f = fakeDeps();
    const base = f.deps.run;
    f.deps.run = async (argv) => {
      order.push(`start ${argv[1]}`);
      await Bun.sleep(5);
      order.push(`end ${argv[1]}`);
      return base(argv);
    };
    const agent = new Agent(f.deps);
    const r = (port: number) =>
      dispatch(
        agent,
        f.deps,
        JSON.stringify({ ...write(port), id: String(port) }),
      );
    await Promise.all([r(20417), r(20418)]);
    expect(order).toEqual([
      "start validate",
      "end validate",
      "start reload",
      "end reload",
      "start validate",
      "end validate",
      "start reload",
      "end reload",
    ]);
  });
});

describe("health.check", () => {
  test("2xx is healthy; anything else or an error is not", async () => {
    const { send, setHttp } = setup();
    const req = { id: "1", op: "health.check", params: { port: 20417 } };
    expect(await send(req)).toMatchObject({
      ok: true,
      result: { ok: true, status: 200 },
    });
    setHttp(503);
    expect(await send(req)).toMatchObject({
      ok: true,
      result: { ok: false, status: 503 },
    });
    setHttp(new Error("ECONNREFUSED"));
    expect(await send(req)).toMatchObject({
      ok: true,
      result: { ok: false, status: null },
    });
  });
});

// node:net unix sockets need a POSIX host; CI (Linux) runs these.
describe.skipIf(process.platform === "win32")("socket server", () => {
  async function roundTrip(path: string, payload: string): Promise<string> {
    return new Promise((resolve, reject) => {
      let out = "";
      const c = connect(path, () => c.write(payload));
      c.setEncoding("utf8");
      c.on("data", (d) => {
        out += d;
      });
      c.on("end", () => resolve(out));
      c.on("error", reject);
    });
  }

  test("answers one request per connection, 0660", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kit-agent-"));
    const path = join(dir, "agent.sock");
    const f = fakeDeps();
    const server = await serve(new Agent(f.deps), f.deps, { path, gid: null });
    try {
      const res = await roundTrip(
        path,
        '{"id":"1","op":"version","params":{}}\n',
      );
      expect(JSON.parse(res)).toMatchObject({ id: "1", ok: true });
      const { statSync } = await import("node:fs");
      expect(statSync(path).mode & 0o777).toBe(0o660);
      const big = await roundTrip(path, "x".repeat(MAX_REQUEST_BYTES + 10));
      expect(JSON.parse(big)).toMatchObject({
        ok: false,
        error: { code: "bad_request" },
      });
    } finally {
      server.close();
    }
  });
});
