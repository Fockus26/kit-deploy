import { describe, expect, test } from "bun:test";
import { containerNameSchema } from "../../agent/protocol";
import { runCli } from "../../cli/commands";
import { dockerRunArgs } from "../../lib/core/docker";
import { containerName } from "../../lib/core/target";
import { CoreInputError } from "../../lib/core/validate";
import { processProject } from "../../lib/deploy/switch";
import {
  at,
  deps,
  fakeAgent,
  memoryRepo,
  name,
  type Row,
  sha,
} from "./deploy-fakes";

const SHA = sha("b");
const prod = { project: "kd_hello", env: "production" } as const;

describe("generation in the container's name", () => {
  test("the first deployment keeps its name; a redeploy gets -g<n>", () => {
    expect(containerName(prod, SHA)).toBe("kd_hello-prod-bbbbbbbbbbbb");
    expect(containerName(prod, SHA, 1)).toBe("kd_hello-prod-bbbbbbbbbbbb");
    expect(containerName(prod, SHA, 2)).toBe("kd_hello-prod-bbbbbbbbbbbb-g2");
    expect(
      containerName({ project: "kd_hello", env: "preview", pr: 7 }, SHA, 12),
    ).toBe("kd_hello-pr-7-bbbbbbbbbbbb-g12");
    for (const bad of [0, -1, 1.5, 10_000]) {
      expect(() => containerName(prod, SHA, bad)).toThrow(CoreInputError);
    }
  });

  test("docker run names it so", () => {
    const args = dockerRunArgs({
      target: prod,
      sha: SHA,
      generation: 3,
      image: `ghcr.io/fockus26/kd-hello:${SHA}`,
      port: 20400,
      memoryMb: 512,
    });
    expect(args.slice(2, 4)).toEqual([
      "--name",
      "kd_hello-prod-bbbbbbbbbbbb-g3",
    ]);
  });

  test("the agent accepts exactly those names", () => {
    for (const ok of [
      "kd_hello-prod-bbbbbbbbbbbb",
      "kd_hello-prod-bbbbbbbbbbbb-g2",
      "kd_hello-pr-7-bbbbbbbbbbbb-g9999",
    ]) {
      expect(containerNameSchema.safeParse(ok).success).toBe(true);
    }
    for (const bad of [
      "kd_hello-prod-bbbbbbbbbbbb-g1",
      "kd_hello-prod-bbbbbbbbbbbb-g0",
      "kd_hello-prod-bbbbbbbbbbbb-g01",
      "kd_hello-prod-bbbbbbbbbbbb-g10000",
      "kd_hello-prod-bbbbbbbbbbbb-gx",
    ]) {
      expect(containerNameSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("redeploy through the switch", () => {
  const live = (): Row[] => [
    {
      id: "live",
      sha: SHA,
      status: "live",
      container: name("b"),
      port: 20400,
      createdAt: at(1),
    },
  ];

  test("queues the next generation of the live commit and swaps to it without downtime", async () => {
    const rows = live();
    const { agent, calls, ops } = fakeAgent();
    const repo = memoryRepo(rows);
    const { d } = deps(agent, repo);
    expect(await repo.queueRedeploy("p1", null)).toEqual({
      id: "redeploy-2",
      sha: SHA,
      generation: 2,
    });
    expect(await processProject(d, "p1")).toEqual([
      { id: "redeploy-2", result: "live" },
    ]);
    // New container beside the old one; the old one stops only after the switch.
    expect(ops()).toEqual([
      "image.pull",
      "ports.allocate",
      "container.run",
      "health.check",
      "site.write",
      "container.stop",
    ]);
    expect(calls[1]?.params).toMatchObject({ generation: 2 });
    expect(calls[2]?.params).toMatchObject({ sha: SHA, generation: 2 });
    expect(calls[5]?.params).toMatchObject({ name: name("b") });
    expect(rows.find((r) => r.id === "live")?.status).toBe("superseded");
    expect(rows.find((r) => r.id === "redeploy-2")).toMatchObject({
      status: "live",
      container: "kd_hello-prod-bbbbbbbbbbbb-g2",
    });
  });

  test("a second redeploy takes generation 3", async () => {
    const rows = live();
    const { agent } = fakeAgent();
    const repo = memoryRepo(rows);
    const { d } = deps(agent, repo);
    await repo.queueRedeploy("p1", null);
    await processProject(d, "p1");
    expect((await repo.queueRedeploy("p1", null))?.generation).toBe(3);
  });

  test("nothing live: nothing queued", async () => {
    const repo = memoryRepo([]);
    expect(await repo.queueRedeploy("p1", null)).toBeNull();
    expect(await repo.queueRedeploy("p1", 7)).toBeNull();
  });
});

describe("kit-deploy redeploy", () => {
  function cli(rows: Row[]) {
    const { agent, ops } = fakeAgent();
    const repo = memoryRepo(rows);
    const { d } = deps(agent, repo);
    const ctx = {
      deploy: () => ({ switch: d, store: {} as never }),
    };
    return { run: (argv: string[]) => runCli(argv, agent, ctx), ops };
  }

  test("production", async () => {
    const c = cli([
      {
        id: "live",
        sha: SHA,
        status: "live",
        container: name("b"),
        port: 20400,
        createdAt: at(1),
      },
    ]);
    const r = await c.run(["redeploy", "kd_hello"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain(
      "redeploying kd_hello production: bbbbbbbbbbbb generation 2",
    );
    expect(r.out).toContain("live redeploy-2");
  });

  test("a PR's preview", async () => {
    const c = cli([
      {
        id: "pv",
        sha: SHA,
        pr: 7,
        status: "live",
        container: "kd_hello-pr-7-bbbbbbbbbbbb",
        port: 20401,
        createdAt: at(1),
      },
    ]);
    const r = await c.run(["redeploy", "kd_hello", "--pr", "7"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("redeploying kd_hello pr-7");
  });

  test("errors", async () => {
    const c = cli([]);
    expect((await c.run(["redeploy"])).code).toBe(2);
    expect((await c.run(["redeploy", "Bad"])).code).toBe(2);
    expect((await c.run(["redeploy", "kd_hello", "--pr", "x"])).code).toBe(2);
    expect((await c.run(["redeploy", "nope"])).err).toBe("no project nope\n");
    const none = await c.run(["redeploy", "kd_hello"]);
    expect(none.code).toBe(1);
    expect(none.err).toContain("nothing live in kd_hello production");
    expect(c.ops()).toEqual([]);
  });
});
