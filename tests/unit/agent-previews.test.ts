import { describe, expect, test } from "bun:test";
import { dispatch } from "../../agent/dispatch";
import { Agent, AgentError, assertPreviewFile } from "../../agent/ops";
import { fakeDeps } from "./agent-fakes";

const PSITE = "/etc/caddy/sites/kit-previews.caddy";
const FILE = "/etc/caddy/previews/kd_hello-pr-7.caddy";
const prod = { project: "kd_hello", env: "production" } as const;

const RUNNING_FILE = [
  "# Written by kit-deploy for kd_hello-pr-7 (running) — do not edit by hand.",
  "@kd_hello-pr-7 host kd-hello-pr-7.preview.fockus.dev",
  "handle @kd_hello-pr-7 {",
  "\timport kit_preview 127.0.0.1:29007",
  "}",
  "",
].join("\n");

const running = (port = 29007) => ({
  id: "p1",
  op: "preview.write",
  params: { project: "kd_hello", pr: 7, state: "running", port },
});
const asleep = {
  id: "p2",
  op: "preview.write",
  params: { project: "kd_hello", pr: 7, state: "asleep" },
};
const remove = {
  id: "p3",
  op: "preview.remove",
  params: { project: "kd_hello", pr: 7 },
};

/** An agent over fakes; `installed` puts the wildcard site in place, as update.sh does. */
function setup(
  handlers?: Parameters<typeof fakeDeps>[0],
  { installed = true } = {},
) {
  const f = fakeDeps(handlers);
  if (installed) f.files.set(PSITE, "*.preview.fockus.dev { … }");
  const agent = new Agent(f.deps);
  const send = (req: unknown) => dispatch(agent, f.deps, JSON.stringify(req));
  return { ...f, send };
}

describe("preview.write", () => {
  test("running: renders, writes, validates, reloads", async () => {
    const { send, calls, files } = setup();
    expect(await send(running())).toMatchObject({
      ok: true,
      result: { path: FILE, state: "running", changed: true },
    });
    expect(files.get(FILE)).toBe(RUNNING_FILE);
    expect(calls.map((c) => c.slice(0, 2).join(" "))).toEqual([
      "caddy validate",
      "caddy reload",
    ]);
  });

  test("asleep replaces the running file with the gated page; the same bytes do not reload", async () => {
    const { send, calls, files } = setup();
    await send(running());
    expect(await send(asleep)).toMatchObject({
      ok: true,
      result: { state: "asleep", changed: true },
    });
    expect(files.get(FILE)).toContain(
      "\timport kit_preview_asleep kd_hello 7\n",
    );
    expect(files.get(FILE)).not.toContain("127.0.0.1");
    calls.length = 0;
    expect(await send(asleep)).toMatchObject({ result: { changed: false } });
    expect(calls).toEqual([]);
  });

  test("refuses when the wildcard site is not installed (nothing would import the file)", async () => {
    const { send, calls, files } = setup(undefined, { installed: false });
    expect(await send(running())).toMatchObject({
      ok: false,
      error: { code: "invalid_config" },
    });
    expect(files.has(FILE)).toBe(false);
    expect(calls).toEqual([]);
  });

  test("an invalid config puts the previous file back and does not reload", async () => {
    let fail = false;
    const { send, calls, files } = setup({
      "caddy validate": () => (fail ? { code: 1, stderr: "bad" } : {}),
    });
    await send(running(29007));
    fail = true;
    calls.length = 0;
    expect(await send(running(29008))).toMatchObject({
      ok: false,
      error: { code: "invalid_config" },
    });
    expect(files.get(FILE)).toBe(RUNNING_FILE);
    expect(calls.map((c) => c[1])).toEqual(["validate"]);
  });

  test("a new preview that fails validation leaves no file", async () => {
    const { send, files } = setup({ "caddy validate": () => ({ code: 1 }) });
    await send(asleep);
    expect(files.has(FILE)).toBe(false);
  });

  test("a failed reload restores the previous state", async () => {
    const { send, files } = setup({
      "caddy reload": () => ({ code: 1, stderr: "admin down" }),
    });
    expect(await send(running())).toMatchObject({
      ok: false,
      error: { code: "command_failed" },
    });
    expect(files.has(FILE)).toBe(false);
  });

  test.each([
    ["a traversal project", { project: "../../etc/x", pr: 7, state: "asleep" }],
    ["a project with a slash", { project: "a/b", pr: 7, state: "asleep" }],
    ["a project with a newline", { project: "a\n}", pr: 7, state: "asleep" }],
    ["a project with a space", { project: "a b", pr: 7, state: "asleep" }],
    ["an uppercase project", { project: "KD", pr: 7, state: "asleep" }],
    ["PR 0", { project: "kd_hello", pr: 0, state: "asleep" }],
    ["a string PR", { project: "kd_hello", pr: "7", state: "asleep" }],
    ["a fractional PR", { project: "kd_hello", pr: 7.5, state: "asleep" }],
    ["an unknown state", { project: "kd_hello", pr: 7, state: "public" }],
    [
      "running without a port",
      { project: "kd_hello", pr: 7, state: "running" },
    ],
    [
      "asleep with a port",
      { project: "kd_hello", pr: 7, state: "asleep", port: 29007 },
    ],
    [
      "a port below D016's range (the dashboard's 3100)",
      { project: "kd_hello", pr: 7, state: "running", port: 3100 },
    ],
    [
      "a port above D016's range",
      { project: "kd_hello", pr: 7, state: "running", port: 30000 },
    ],
    [
      "a port as text",
      { project: "kd_hello", pr: 7, state: "running", port: "29007" },
    ],
    [
      "a host from the caller",
      { project: "kd_hello", pr: 7, state: "asleep", host: "evil.dev" },
    ],
    [
      "free-form content",
      { project: "kd_hello", pr: 7, state: "asleep", content: "respond 200" },
    ],
    [
      "a path from the caller",
      {
        project: "kd_hello",
        pr: 7,
        state: "asleep",
        path: "/etc/caddy/Caddyfile",
      },
    ],
  ])("rejects %s before touching anything", async (_, params) => {
    const { send, calls, files } = setup();
    expect(await send({ id: "x", op: "preview.write", params })).toMatchObject({
      ok: false,
      error: { code: "bad_request" },
    });
    expect(calls).toEqual([]);
    expect([...files.keys()]).toEqual([PSITE]);
  });
});

describe("preview.remove", () => {
  test("removes and reloads; a missing preview is a no-op", async () => {
    const { send, calls, files } = setup();
    await send(running());
    calls.length = 0;
    expect(await send(remove)).toMatchObject({
      ok: true,
      result: { path: FILE, removed: true },
    });
    expect(files.has(FILE)).toBe(false);
    expect(calls.map((c) => c[1])).toEqual(["validate", "reload"]);
    calls.length = 0;
    expect(await send(remove)).toMatchObject({ result: { removed: false } });
    expect(calls).toEqual([]);
  });

  test("a failed validation puts the file back", async () => {
    let fail = false;
    const { send, files } = setup({
      "caddy validate": () => (fail ? { code: 1 } : {}),
    });
    await send(running());
    fail = true;
    expect(await send(remove)).toMatchObject({
      ok: false,
      error: { code: "invalid_config" },
    });
    expect(files.get(FILE)).toBe(RUNNING_FILE);
  });

  test.each([
    ["a traversal project", { project: "..", pr: 7 }],
    ["a missing PR", { project: "kd_hello" }],
    [
      "an extra key",
      { project: "kd_hello", pr: 7, path: "/etc/caddy/Caddyfile" },
    ],
  ])("rejects %s", async (_, params) => {
    const { send, calls } = setup();
    expect(await send({ id: "x", op: "preview.remove", params })).toMatchObject(
      { ok: false, error: { code: "bad_request" } },
    );
    expect(calls).toEqual([]);
  });
});

describe("no preview outside the login", () => {
  test("site.write and site.remove refuse a preview target or a preview host", async () => {
    const { send, calls, files } = setup();
    const pv = { project: "kd_hello", env: "preview", pr: 7 };
    for (const req of [
      {
        op: "site.write",
        params: { target: pv, hosts: ["a.dev"], port: 20000 },
      },
      { op: "site.remove", params: { target: pv } },
      {
        op: "site.write",
        params: {
          target: prod,
          hosts: ["kd-hello-pr-7.preview.fockus.dev"],
          port: 20000,
        },
      },
      {
        op: "site.write",
        params: { target: prod, hosts: ["X.Preview.Fockus.Dev"], port: 20000 },
      },
    ]) {
      expect(await send({ id: "x", ...req })).toMatchObject({
        ok: false,
        error: { code: "bad_request" },
      });
    }
    expect(calls).toEqual([]);
    expect([...files.keys()]).toEqual([PSITE]);
  });

  test("assertPreviewFile accepts only one gated preview file", () => {
    const good = { path: FILE, content: RUNNING_FILE };
    expect(assertPreviewFile(good)).toBe(good);
    expect(
      assertPreviewFile({
        path: FILE,
        content: RUNNING_FILE.replace("(running)", "(asleep)").replace(
          "import kit_preview 127.0.0.1:29007",
          "import kit_preview_asleep kd_hello 7",
        ),
      }).path,
    ).toBe(FILE);
    for (const bad of [
      { ...good, path: "/etc/caddy/sites/kd_hello-pr-7.caddy" },
      { ...good, path: "/etc/caddy/previews/../Caddyfile" },
      { ...good, path: "/etc/caddy/previews/x.caddy" },
      {
        ...good,
        content: RUNNING_FILE.replace(
          "import kit_preview 127.0.0.1:29007",
          "reverse_proxy 127.0.0.1:29007",
        ),
      },
      {
        ...good,
        content: RUNNING_FILE.replace("127.0.0.1:29007", "10.0.0.1:29007"),
      },
      {
        ...good,
        content: RUNNING_FILE.replace("preview.fockus.dev", "fockus.dev"),
      },
      {
        ...good,
        content: RUNNING_FILE.replace(
          "@kd_hello-pr-7 host",
          "@kd_hello-pr-8 host",
        ),
      },
      { ...good, content: `${RUNNING_FILE}respond 200\n` },
      {
        ...good,
        content: RUNNING_FILE.replace(
          "import kit_preview 127.0.0.1:29007",
          "import kit_preview_asleep other 9",
        ),
      },
    ]) {
      expect(() => assertPreviewFile(bad)).toThrow(AgentError);
    }
  });
});

describe("preview.list", () => {
  test("only <project>-pr-<n>.caddy names count; the rest is counted, not named", async () => {
    const { send, files, calls } = setup();
    files.set("/etc/caddy/previews/kd_hello-pr-7.caddy", "x");
    files.set("/etc/caddy/previews/old_site-pr-12.caddy", "x");
    files.set("/etc/caddy/previews/kd_hello-pr-7.caddy.tmp", "x");
    files.set("/etc/caddy/previews/README.txt", "x");
    files.set("/etc/caddy/previews/Kd-pr-1.caddy", "x");
    files.set("/etc/caddy/sites/kd_hello.caddy", "x");
    expect(
      await send({ id: "l1", op: "preview.list", params: {} }),
    ).toMatchObject({
      ok: true,
      result: {
        previews: [
          { project: "kd_hello", pr: 7 },
          { project: "old_site", pr: 12 },
        ],
        ignored: 3,
      },
    });
    expect(calls).toEqual([]);
  });

  test("an empty or missing directory lists nothing; params are refused", async () => {
    const { send } = setup();
    expect(
      await send({ id: "l2", op: "preview.list", params: {} }),
    ).toMatchObject({
      ok: true,
      result: { previews: [], ignored: 0 },
    });
    expect(
      await send({ id: "l3", op: "preview.list", params: { dir: "/etc" } }),
    ).toMatchObject({ ok: false, error: { code: "bad_request" } });
  });
});
