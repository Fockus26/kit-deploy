import { describe, expect, test } from "bun:test";
import type { StatusPublisher } from "../../lib/deploy/commit-status";
import { closePreview, processProject } from "../../lib/deploy/switch";
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

/** `kd_hello-pr-<n>-<sha12>`, as `containerName` names a preview's container. */
const prName = (pr: number, c: string) => `kd_hello-pr-${pr}-${c.repeat(12)}`;
const PROJECT = { id: "p1", name: "kd_hello", repo: "Fockus26/kd-hello" };

const queued = (id: string, c: string, minute: number, pr?: number): Row => ({
  id,
  sha: sha(c),
  ...(pr === undefined ? {} : { pr }),
  status: "queued",
  container: null,
  port: null,
  createdAt: at(minute),
});

const productionLive = (): Row => ({
  id: "prod",
  sha: sha("f"),
  status: "live",
  container: name("f"),
  port: 20100,
  createdAt: at(0),
});

describe("preview switch", () => {
  test("a PR's first push: its own 384 MB container, its preview file, no site.write", async () => {
    const rows: Row[] = [productionLive(), queued("p7", "a", 1, 7)];
    const { agent, calls, ops } = fakeAgent();
    const published: unknown[] = [];
    const status: StatusPublisher = async (s) => {
      published.push(s);
    };
    const { d, sleeps } = deps(agent, memoryRepo(rows));

    expect(await processProject({ ...d, status }, "p1")).toEqual([
      { id: "p7", result: "live" },
    ]);
    expect(ops()).toEqual([
      "image.pull",
      "ports.allocate",
      "container.run",
      "health.check",
      "preview.write",
    ]);
    const target = { project: "kd_hello", env: "preview", pr: 7 };
    expect(calls[1]?.params).toEqual({ target, sha: sha("a") });
    expect(calls[2]?.params).toEqual({
      target,
      sha: sha("a"),
      image: `ghcr.io/fockus26/kd-hello:${sha("a")}`,
      port: 20500,
      memoryMb: 384,
    });
    expect(calls[4]?.params).toEqual({
      project: "kd_hello",
      pr: 7,
      state: "running",
      port: 20500,
    });
    expect(sleeps).toEqual([]); // nothing to drain
    expect(rows.find((r) => r.id === "p7")).toMatchObject({
      status: "live",
      container: prName(7, "a"),
      port: 20500,
    });
    // Production is not touched; the status goes out on the preview's own context.
    expect(rows.find((r) => r.id === "prod")).toMatchObject(productionLive());
    expect(published).toEqual([
      expect.objectContaining({ context: "kit-deploy/preview" }),
    ]);
  });

  test("the next push replaces the PR's container: new one healthy → file → drain → stop + remove", async () => {
    const rows: Row[] = [
      productionLive(),
      {
        id: "p7a",
        sha: sha("a"),
        pr: 7,
        status: "live",
        container: prName(7, "a"),
        port: 20500,
        createdAt: at(1),
      },
      queued("p7b", "b", 2, 7),
    ];
    const { agent, calls, ops } = fakeAgent({
      "ports.allocate": () => ok({ port: 20501 }),
    });
    const { d, sleeps } = deps(agent, memoryRepo(rows));

    await processProject(d, "p1");
    expect(ops()).toEqual([
      "image.pull",
      "ports.allocate",
      "container.run",
      "health.check",
      "preview.write",
      "container.stop",
      "container.remove",
    ]);
    expect(calls[4]?.params).toMatchObject({ pr: 7, port: 20501 });
    expect(calls[5]?.params).toEqual({ name: prName(7, "a") });
    expect(calls[6]?.params).toEqual({ name: prName(7, "a") });
    expect(sleeps).toEqual([10_000]);
    expect(rows.find((r) => r.id === "p7b")).toMatchObject({
      status: "live",
      container: prName(7, "b"),
      port: 20501,
    });
    expect(rows.find((r) => r.id === "p7a")).toMatchObject({
      status: "superseded",
      container: null,
      port: null,
    });
    expect(rows.find((r) => r.id === "prod")).toMatchObject(productionLive());
  });

  test("a preview that fails health is removed; the PR's live preview keeps serving", async () => {
    const rows: Row[] = [
      {
        id: "p7a",
        sha: sha("a"),
        pr: 7,
        status: "live",
        container: prName(7, "a"),
        port: 20500,
        createdAt: at(1),
      },
      queued("p7b", "b", 2, 7),
    ];
    const { agent, calls, ops } = fakeAgent({
      "ports.allocate": () => ok({ port: 20501 }),
      "health.check": () => ok({ ok: false, status: 502 }),
    });
    const { d } = deps(agent, memoryRepo(rows));

    const [out] = await processProject(d, "p1");
    expect(out?.result).toBe("failed");
    expect(ops()).not.toContain("preview.write");
    const removed = calls.filter((c) => c.op === "container.remove");
    expect(removed.map((c) => c.params.name)).toEqual([prName(7, "b")]);
    expect(rows.find((r) => r.id === "p7a")?.status).toBe("live");
    expect(rows.find((r) => r.id === "p7b")?.status).toBe("failed");
  });

  test("Caddy refusing the preview file fails the deploy and removes the new container", async () => {
    const rows: Row[] = [queued("p7", "a", 1, 7)];
    const { agent, calls } = fakeAgent({
      "preview.write": () => err("caddy validate failed"),
    });
    const { d } = deps(agent, memoryRepo(rows));

    const [out] = await processProject(d, "p1");
    expect(out).toMatchObject({ result: "failed" });
    expect(
      calls.filter((c) => c.op === "container.remove").map((c) => c.params),
    ).toEqual([{ name: prName(7, "a") }]);
    expect(rows[0]?.status).toBe("failed");
  });

  test("a newer push supersedes the same PR's queued one, not another PR's nor production's", async () => {
    const rows: Row[] = [
      queued("prod-q", "c", 1),
      queued("p8", "d", 2, 8),
      queued("p7-old", "a", 3, 7),
      queued("p7-new", "b", 4, 7),
    ];
    const { agent, calls } = fakeAgent();
    const { d } = deps(agent, memoryRepo(rows));

    const done = await processProject(d, "p1");
    expect(done.map((x) => x.id).sort()).toEqual(["p7-new", "p8", "prod-q"]);
    expect(rows.find((r) => r.id === "p7-old")?.status).toBe("superseded");
    // Production still goes through its own site.write with its hosts and its own memory.
    const site = calls.find((c) => c.op === "site.write");
    expect(site?.params).toEqual({
      target: { project: "kd_hello", env: "production" },
      hosts: ["hello.fockus.dev"],
      port: 20500,
    });
    const runs = calls.filter((c) => c.op === "container.run");
    expect(runs.map((c) => [c.params.target, c.params.memoryMb])).toEqual([
      [{ project: "kd_hello", env: "preview", pr: 7 }, 384],
      [{ project: "kd_hello", env: "preview", pr: 8 }, 384],
      [{ project: "kd_hello", env: "production" }, 512],
    ]);
  });
});

describe("closePreview", () => {
  test("removes the file, then the PR's containers; its rows are superseded", async () => {
    const rows: Row[] = [
      productionLive(),
      {
        id: "p7a",
        sha: sha("a"),
        pr: 7,
        status: "live",
        container: prName(7, "a"),
        port: 20500,
        createdAt: at(1),
      },
      queued("p7b", "b", 2, 7),
      {
        id: "p8",
        sha: sha("c"),
        pr: 8,
        status: "live",
        container: prName(8, "c"),
        port: 20600,
        createdAt: at(3),
      },
    ];
    const { agent, calls, ops } = fakeAgent();
    const { d } = deps(agent, memoryRepo(rows));

    expect(await closePreview(d, PROJECT, 7)).toEqual({
      removed: [prName(7, "a")],
    });
    expect(ops()).toEqual([
      "preview.remove",
      "container.stop",
      "container.remove",
    ]);
    expect(calls[0]?.params).toEqual({ project: "kd_hello", pr: 7 });
    expect(calls[1]?.params).toEqual({ name: prName(7, "a"), timeoutS: 0 });
    expect(rows.find((r) => r.id === "p7a")).toMatchObject({
      status: "superseded",
      container: null,
    });
    // A push that was still queued never starts after the close.
    expect(rows.find((r) => r.id === "p7b")?.status).toBe("superseded");
    expect(await processProject(d, "p1")).toEqual([]);
    // Another PR and production are untouched.
    expect(rows.find((r) => r.id === "p8")?.status).toBe("live");
    expect(rows.find((r) => r.id === "prod")).toMatchObject(productionLive());
  });

  test("closing again (or a PR that never had a preview) only re-removes the file", async () => {
    const rows: Row[] = [productionLive()];
    const { agent, ops } = fakeAgent({
      "preview.remove": () => ok({ removed: false }),
    });
    const { d } = deps(agent, memoryRepo(rows));
    expect(await closePreview(d, PROJECT, 9)).toEqual({ removed: [] });
    expect(ops()).toEqual(["preview.remove"]);
  });

  test("Caddy refusing the removal changes nothing: the next close retries it all", async () => {
    const rows: Row[] = [
      {
        id: "p7a",
        sha: sha("a"),
        pr: 7,
        status: "live",
        container: prName(7, "a"),
        port: 20500,
        createdAt: at(1),
      },
    ];
    const { agent, ops } = fakeAgent({
      "preview.remove": () => err("caddy reload failed"),
    });
    const { d } = deps(agent, memoryRepo(rows));
    await expect(closePreview(d, PROJECT, 7)).rejects.toThrow("preview.remove");
    expect(ops()).toEqual(["preview.remove"]);
    expect(rows[0]).toMatchObject({
      status: "live",
      container: prName(7, "a"),
    });
  });
});
