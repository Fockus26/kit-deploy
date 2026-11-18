import { describe, expect, test } from "bun:test";
import {
  KEEP,
  processProject,
  regenerate,
  rollback,
} from "../../lib/deploy/switch";
import {
  at,
  deps,
  err,
  fakeAgent,
  memoryRepo,
  name,
  ok,
  type Row,
  sha,
} from "./deploy-fakes";

describe("processProject (deploy)", () => {
  test("pull → port → run → health → site → live → drain → stop the old one", async () => {
    const rows: Row[] = [
      {
        id: "old",
        sha: sha("a"),
        status: "live",
        container: name("a"),
        port: 20400,
        createdAt: at(1),
      },
      {
        id: "new",
        sha: sha("b"),
        status: "queued",
        container: null,
        port: null,
        createdAt: at(2),
      },
    ];
    const { agent, calls, ops } = fakeAgent();
    const { d, sleeps } = deps(agent, memoryRepo(rows));

    expect(await processProject(d, "p1")).toEqual([
      { id: "new", result: "live" },
    ]);
    expect(ops()).toEqual([
      "image.pull",
      "ports.allocate",
      "container.run",
      "health.check",
      "site.write",
      "container.stop",
    ]);
    expect(calls[2]?.params).toMatchObject({
      port: 20500,
      memoryMb: 512,
      sha: sha("b"),
    });
    expect(calls[4]?.params).toEqual({
      target: { project: "kd_hello", env: "production" },
      hosts: ["hello.fockus.dev"],
      port: 20500,
    });
    expect(calls[5]?.params).toEqual({ name: name("a") });
    expect(sleeps).toEqual([10_000]); // the drain, before the stop
    expect(rows.find((r) => r.id === "new")).toMatchObject({
      status: "live",
      container: name("b"),
      port: 20500,
    });
    expect(rows.find((r) => r.id === "old")?.status).toBe("superseded");
  });

  test("health never passes: the new container goes away, the old one keeps serving", async () => {
    const rows: Row[] = [
      {
        id: "old",
        sha: sha("a"),
        status: "live",
        container: name("a"),
        port: 20400,
        createdAt: at(1),
      },
      {
        id: "new",
        sha: sha("b"),
        status: "queued",
        container: null,
        port: null,
        createdAt: at(2),
      },
    ];
    const { agent, calls, ops } = fakeAgent({
      "health.check": () => ok({ ok: false, status: 503 }),
    });
    const { d } = deps(agent, memoryRepo(rows));

    expect(await processProject(d, "p1")).toEqual([
      {
        id: "new",
        result: "failed",
        error: "/api/health did not answer 2xx in 3s",
      },
    ]);
    expect(ops()).not.toContain("site.write");
    expect(ops().filter((o) => o === "health.check")).toHaveLength(3);
    expect(calls.slice(-2)).toEqual([
      { op: "container.stop", params: { name: name("b"), timeoutS: 0 } },
      { op: "container.remove", params: { name: name("b") } },
    ]);
    expect(rows.find((r) => r.id === "new")).toMatchObject({
      status: "failed",
    });
    expect(rows.find((r) => r.id === "new")?.error).toContain("/api/health");
    expect(rows.find((r) => r.id === "old")?.status).toBe("live");
  });

  test("a failed pull touches nothing and records why", async () => {
    const rows: Row[] = [
      {
        id: "new",
        sha: sha("b"),
        status: "queued",
        container: null,
        port: null,
        createdAt: at(2),
      },
    ];
    const { agent, ops } = fakeAgent({
      "image.pull": () => err("docker pull failed: manifest unknown"),
    });
    const { d } = deps(agent, memoryRepo(rows));
    await processProject(d, "p1");
    expect(ops()).toEqual(["image.pull"]);
    expect(rows[0]?.error).toContain("manifest unknown");
  });

  test("a project without domains fails before calling the agent", async () => {
    const rows: Row[] = [
      {
        id: "new",
        sha: sha("b"),
        status: "queued",
        container: null,
        port: null,
        createdAt: at(2),
      },
    ];
    const { agent, ops } = fakeAgent();
    const { d } = deps(agent, memoryRepo(rows, []));
    await processProject(d, "p1");
    expect(ops()).toEqual([]);
    expect(rows[0]).toMatchObject({
      status: "failed",
      error:
        "kd_hello has no domain to serve yet (none resolves to the VPS): kit-deploy domain ls kd_hello",
    });
  });

  test("the same commit's kept container is started, not rebuilt or pulled", async () => {
    const rows: Row[] = [
      {
        id: "was",
        sha: sha("a"),
        status: "superseded",
        container: name("a"),
        port: 20400,
        createdAt: at(1),
      },
      {
        id: "live",
        sha: sha("b"),
        status: "live",
        container: name("b"),
        port: 20401,
        createdAt: at(2),
      },
      {
        id: "again",
        sha: sha("a"),
        status: "queued",
        container: null,
        port: null,
        createdAt: at(3),
      },
    ];
    const { agent, ops } = fakeAgent();
    const { d } = deps(agent, memoryRepo(rows));
    await processProject(d, "p1");
    expect(ops()).toEqual([
      "container.start",
      "health.check",
      "site.write",
      "container.stop",
    ]);
    expect(rows.find((r) => r.id === "again")).toMatchObject({
      status: "live",
      container: name("a"),
      port: 20400,
    });
    expect(rows.find((r) => r.id === "was")?.container).toBeNull(); // moved to the new row
  });

  test(`keeps the newest ${KEEP} containers and removes older ones`, async () => {
    const rows: Row[] = "abcdef".split("").map((c, i) => ({
      id: c,
      sha: sha(c),
      status: c === "f" ? "live" : "superseded",
      container: name(c),
      port: 20400 + i,
      createdAt: at(i),
    }));
    rows.push({
      id: "g",
      sha: "1".repeat(40),
      status: "queued",
      container: null,
      port: null,
      createdAt: at(9),
    });
    const { agent, calls } = fakeAgent();
    const { d } = deps(agent, memoryRepo(rows));
    await processProject(d, "p1");
    const removed = calls
      .filter((c) => c.op === "container.remove")
      .map((c) => c.params.name);
    expect(removed).toEqual([name("b"), name("a")]);
    expect(
      rows
        .filter((r) => r.container)
        .map((r) => r.id)
        .sort(),
    ).toEqual(["c", "d", "e", "f", "g"]);
  });

  test("the commit already live is never touched", async () => {
    const rows: Row[] = [
      {
        id: "live",
        sha: sha("a"),
        status: "live",
        container: name("a"),
        port: 20400,
        createdAt: at(1),
      },
      {
        id: "again",
        sha: sha("a"),
        status: "queued",
        container: null,
        port: null,
        createdAt: at(2),
      },
    ];
    const { agent, ops } = fakeAgent();
    const { d } = deps(agent, memoryRepo(rows));
    expect(await processProject(d, "p1")).toEqual([
      {
        id: "again",
        result: "failed",
        error: `${"a".repeat(12)} is already live`,
      },
    ]);
    expect(ops()).toEqual([]);
    expect(rows.find((r) => r.id === "live")?.status).toBe("live");
    expect(rows.find((r) => r.id === "again")?.error).toContain("already live");
  });

  test("an older queued commit is skipped for the newest", async () => {
    const rows: Row[] = [
      {
        id: "q1",
        sha: sha("a"),
        status: "queued",
        container: null,
        port: null,
        createdAt: at(1),
      },
      {
        id: "q2",
        sha: sha("b"),
        status: "queued",
        container: null,
        port: null,
        createdAt: at(2),
      },
    ];
    const { agent } = fakeAgent();
    const { d } = deps(agent, memoryRepo(rows));
    expect(await processProject(d, "p1")).toEqual([
      { id: "q2", result: "live" },
    ]);
    expect(rows.find((r) => r.id === "q1")?.status).toBe("superseded");
  });
});

describe("rollback", () => {
  const history = (): Row[] => [
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
      status: "superseded",
      container: name("b"),
      port: 20401,
      createdAt: at(2),
    },
    {
      id: "d3",
      sha: sha("c"),
      status: "live",
      container: name("c"),
      port: 20402,
      createdAt: at(3),
    },
  ];

  test("goes one step back: start the kept container, health, site, stop the live one", async () => {
    const rows = history();
    const { agent, calls, ops } = fakeAgent();
    const { d, sleeps } = deps(agent, memoryRepo(rows));
    expect(await rollback(d, "kd_hello")).toEqual({ from: "d3", to: "d2" });
    expect(ops()).toEqual([
      "container.start",
      "health.check",
      "site.write",
      "container.stop",
    ]);
    expect(calls[0]?.params).toEqual({ name: name("b") });
    expect(calls[2]?.params).toMatchObject({ port: 20401 });
    expect(calls[3]?.params).toEqual({ name: name("c") });
    expect(sleeps).toEqual([10_000]);
    expect(rows.find((r) => r.id === "d2")?.status).toBe("live");
  });

  test("twice in a row keeps going back", async () => {
    const rows = history();
    const { agent } = fakeAgent();
    const { d } = deps(agent, memoryRepo(rows));
    await rollback(d, "kd_hello");
    expect(await rollback(d, "kd_hello")).toEqual({ from: "d2", to: "d1" });
  });

  test("nothing older to go back to", async () => {
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
    const { agent, ops } = fakeAgent();
    const { d } = deps(agent, memoryRepo(rows));
    await expect(rollback(d, "kd_hello")).rejects.toThrow(
      "no earlier deployment",
    );
    expect(ops()).toEqual([]);
  });

  test("the old one does not answer: stop it again, the live one stays", async () => {
    const rows = history();
    const { agent, ops } = fakeAgent({
      "health.check": () => ok({ ok: false, status: null }),
    });
    const { d } = deps(agent, memoryRepo(rows));
    await expect(rollback(d, "kd_hello")).rejects.toThrow(
      "still on the live one",
    );
    expect(ops()).not.toContain("site.write");
    expect(ops().at(-1)).toBe("container.stop");
    expect(rows.find((r) => r.id === "d3")?.status).toBe("live");
  });

  test("an unknown project", async () => {
    const { agent } = fakeAgent();
    const { d } = deps(agent, memoryRepo([]));
    await expect(rollback(d, "nope")).rejects.toThrow("no project nope");
  });
});

describe("regenerate", () => {
  test("rewrites every live site and starts a container that is not running", async () => {
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
    const { agent, calls } = fakeAgent({
      "container.list": () => ok([{ name: name("a"), state: "exited" }]),
    });
    const { d } = deps(agent, memoryRepo(rows));
    expect(await regenerate(d)).toEqual([{ project: "kd_hello", ok: true }]);
    expect(calls.map((c) => c.op)).toEqual([
      "container.list",
      "container.start",
      "site.write",
    ]);
  });

  test("a running container is left alone; a failure is reported per site", async () => {
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
    const { agent, ops } = fakeAgent({
      "container.list": () => ok([{ name: name("a"), state: "running" }]),
      "site.write": () => err("caddy validate failed"),
    });
    const { d } = deps(agent, memoryRepo(rows));
    const [r] = await regenerate(d);
    expect(r).toMatchObject({ project: "kd_hello", ok: false });
    expect(ops()).toEqual(["container.list", "site.write"]);
  });
});

describe("processProject passes the environment's variables", () => {
  const blob = {
    ciphertext: "AAAA",
    iv: "A".repeat(16),
    tag: `${"A".repeat(22)}==`,
    keyVersion: 1,
  };
  const vars = {
    production: [{ name: "PROD_ONLY", secret: true, sealed: blob }],
    preview: [{ name: "PREVIEW_ONLY", secret: true, sealed: blob }],
  };

  test("production gets Production's, sealed as stored", async () => {
    const rows: Row[] = [
      {
        id: "new",
        sha: sha("b"),
        status: "queued",
        container: null,
        port: null,
        createdAt: at(2),
      },
    ];
    const { agent, calls } = fakeAgent();
    const { d } = deps(agent, memoryRepo(rows, undefined, vars));
    await processProject(d, "p1");
    const run = calls.find((c) => c.op === "container.run");
    expect(run?.params.vars).toEqual(vars.production);
  });

  test("a preview gets Preview's", async () => {
    const rows: Row[] = [
      {
        id: "pr",
        sha: sha("c"),
        pr: 7,
        status: "queued",
        container: null,
        port: null,
        createdAt: at(2),
      },
    ];
    const { agent, calls } = fakeAgent();
    const { d } = deps(agent, memoryRepo(rows, undefined, vars));
    await processProject(d, "p1");
    const run = calls.find((c) => c.op === "container.run");
    expect(run?.params.vars).toEqual(vars.preview);
  });
});
