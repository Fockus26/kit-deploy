import { describe, expect, test } from "bun:test";
import type { CommentUpsert } from "../../lib/deploy/pr-comment";
import type { SwitchRepo } from "../../lib/deploy/repo";
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

/** U9 (D017): at most four previews running per project; a fifth puts the least recently pushed
 * one to sleep, and a push to a sleeping preview wakes it. */

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

const live = (pr: number, c: string, minute: number): Row => ({
  id: `live-${pr}`,
  sha: sha(c),
  pr,
  status: "live",
  container: prName(pr, c),
  port: 29000 + pr,
  createdAt: at(minute),
});

const asleep = (pr: number, c: string, minute: number): Row => ({
  ...live(pr, c, minute),
  id: `asleep-${pr}`,
  status: "asleep",
  container: null,
  port: null,
});

const productionLive = (): Row => ({
  id: "prod",
  sha: sha("f"),
  status: "live",
  container: name("f"),
  port: 20100,
  createdAt: at(0),
});

/** Four live previews; PR 2 was pushed longest ago (PR 1 got a later push). */
const fourLive = () => [
  productionLive(),
  live(1, "1", 5),
  live(2, "2", 2),
  live(3, "3", 3),
  live(4, "4", 4),
];

function commenter() {
  const calls: CommentUpsert[] = [];
  const comments = async (c: CommentUpsert) => {
    calls.push(c);
    return c.create ? ("created" as const) : ("updated" as const);
  };
  return { calls, comments };
}

const byId = (rows: Row[], id: string) => rows.find((r) => r.id === id);
const asleepWrites = (calls: ReturnType<typeof fakeAgent>["calls"]) =>
  calls.filter((c) => c.op === "preview.write" && c.params.state === "asleep");

describe("preview limit (D017)", () => {
  test("the fifth PR puts the least recently pushed preview to sleep, then starts", async () => {
    const rows = [...fourLive(), queued("p5", "5", 10, 5)];
    const { agent, calls, ops } = fakeAgent();
    const { calls: comments, comments: fn } = commenter();
    const { d, logs } = deps(agent, memoryRepo(rows));

    expect(await processProject({ ...d, comments: fn }, "p1")).toEqual([
      { id: "p5", result: "live" },
    ]);
    expect(ops()).toEqual([
      "preview.write", // PR 2 → dormido, before anything stops
      "container.stop",
      "container.remove",
      "image.pull",
      "ports.allocate",
      "container.run",
      "health.check",
      "preview.write",
    ]);
    expect(calls[0]?.params).toEqual({
      project: "kd_hello",
      pr: 2,
      state: "asleep",
    });
    expect(calls[1]?.params).toEqual({ name: prName(2, "2") });
    expect(calls[2]?.params).toEqual({ name: prName(2, "2") });
    expect(byId(rows, "live-2")).toMatchObject({
      status: "asleep",
      container: null,
      port: null,
    });
    for (const pr of [1, 3, 4])
      expect(byId(rows, `live-${pr}`)?.status).toBe("live");
    expect(byId(rows, "p5")?.status).toBe("live");
    expect(byId(rows, "prod")?.status).toBe("live");
    expect(logs).toContainEqual({
      event: "preview.asleep",
      project: "kd_hello",
      pr: 2,
      container: prName(2, "2"),
    });
    // The sleeper's comment is edited (never created); the new one gets its URL.
    expect(comments.map((c) => [c.pr, c.create])).toEqual([
      [2, false],
      [5, true],
    ]);
    expect(comments[0]?.body).toContain("dormida");
    expect(comments[0]?.body).toContain("próximo push al PR #2");
  });

  test("production never counts: three previews and production deploy a fourth without sleeping", async () => {
    const rows: Row[] = [
      productionLive(),
      // Kept production containers (rollback) do not count either.
      {
        ...productionLive(),
        id: "prod-old",
        sha: sha("e"),
        status: "superseded",
        container: name("e"),
      },
      live(1, "1", 1),
      live(2, "2", 2),
      live(3, "3", 3),
      queued("p4", "4", 10, 4),
    ];
    const { agent, ops } = fakeAgent();
    const { d } = deps(agent, memoryRepo(rows));

    await processProject(d, "p1");
    expect(ops()).not.toContain("container.stop");
    expect(rows.filter((r) => r.status === "asleep")).toEqual([]);
    expect(byId(rows, "p4")?.status).toBe("live");
  });

  test("a production deploy with four previews live sleeps nobody", async () => {
    const rows = [...fourLive(), queued("prod2", "a", 10)];
    const { agent, calls } = fakeAgent();
    const { d } = deps(agent, memoryRepo(rows));

    await processProject(d, "p1");
    expect(asleepWrites(calls)).toEqual([]);
    expect(rows.filter((r) => r.pr && r.status === "live")).toHaveLength(4);
  });

  test("a push to a live preview replaces it without sleeping another", async () => {
    const rows = [...fourLive(), queued("p2b", "b", 10, 2)];
    const { agent, calls } = fakeAgent();
    const { d } = deps(agent, memoryRepo(rows));

    await processProject(d, "p1");
    expect(asleepWrites(calls)).toEqual([]);
    expect(byId(rows, "p2b")?.status).toBe("live");
    expect(byId(rows, "live-2")?.status).toBe("superseded");
  });

  test("a push to a sleeping preview wakes it, and puts the next oldest to sleep", async () => {
    const rows: Row[] = [
      productionLive(),
      asleep(2, "2", 1),
      live(1, "1", 5),
      live(3, "3", 3),
      live(4, "4", 4),
      live(6, "6", 6),
      queued("p2b", "b", 10, 2),
    ];
    const { agent, calls } = fakeAgent();
    const { calls: comments, comments: fn } = commenter();
    const { d } = deps(agent, memoryRepo(rows));

    expect(await processProject({ ...d, comments: fn }, "p1")).toEqual([
      { id: "p2b", result: "live" },
    ]);
    expect(asleepWrites(calls).map((c) => c.params.pr)).toEqual([3]);
    expect(byId(rows, "live-3")?.status).toBe("asleep");
    expect(byId(rows, "p2b")).toMatchObject({
      status: "live",
      container: prName(2, "b"),
    });
    // The asleep row is replaced like a live one, and had no container to remove.
    expect(byId(rows, "asleep-2")?.status).toBe("superseded");
    expect(
      calls.filter((c) => c.op === "container.remove").map((c) => c.params),
    ).toEqual([{ name: prName(3, "3") }]);
    expect(
      calls.find(
        (c) =>
          c.op === "preview.write" &&
          c.params.pr === 2 &&
          c.params.state === "running",
      ),
    ).toBeDefined();
    expect(comments.map((c) => [c.pr, c.create])).toEqual([
      [3, false],
      [2, true],
    ]);
  });

  test("waking with room to spare sleeps nobody", async () => {
    const rows: Row[] = [
      asleep(2, "2", 1),
      live(1, "1", 5),
      live(3, "3", 3),
      queued("p2b", "b", 10, 2),
    ];
    const { agent, calls } = fakeAgent();
    const { d } = deps(agent, memoryRepo(rows));

    await processProject(d, "p1");
    expect(asleepWrites(calls)).toEqual([]);
    expect(byId(rows, "p2b")?.status).toBe("live");
  });

  test("closing a sleeping PR removes its file and supersedes its row", async () => {
    const rows: Row[] = [productionLive(), asleep(2, "2", 1), live(1, "1", 5)];
    const { agent, ops } = fakeAgent();
    const { calls: comments, comments: fn } = commenter();
    const { d } = deps(agent, memoryRepo(rows));

    expect(await closePreview({ ...d, comments: fn }, PROJECT, 2)).toEqual({
      removed: [],
    });
    expect(ops()).toEqual(["preview.remove"]); // no container left to stop
    expect(byId(rows, "asleep-2")?.status).toBe("superseded");
    expect(byId(rows, "live-1")?.status).toBe("live");
    expect(comments.map((c) => [c.pr, c.create])).toEqual([[2, false]]);
    expect(comments[0]?.body).toContain("eliminada");
  });

  test("Caddy refusing the dormido file fails the deploy and changes nothing", async () => {
    const rows = [...fourLive(), queued("p5", "5", 10, 5)];
    const { agent, ops } = fakeAgent({
      "preview.write": (p) =>
        p.state === "asleep" ? err("caddy reload failed") : ok({}),
    });
    const { d } = deps(agent, memoryRepo(rows));

    const [out] = await processProject(d, "p1");
    expect(out).toMatchObject({ id: "p5", result: "failed" });
    expect(ops()).toEqual(["preview.write"]);
    expect(byId(rows, "live-2")).toMatchObject({
      status: "live",
      container: prName(2, "2"),
    });
    expect(byId(rows, "p5")?.status).toBe("failed");
  });

  test("a stop that fails keeps the fifth from starting; the next push retries that container first", async () => {
    const rows = [...fourLive(), queued("p5", "5", 10, 5)];
    let stopFails = true;
    const { agent, calls, ops } = fakeAgent({
      "container.stop": (p) =>
        stopFails ? err("docker stop timed out") : ok({ name: p.name }),
    });
    const { d } = deps(agent, memoryRepo(rows));

    const [first] = await processProject(d, "p1");
    expect(first).toMatchObject({ result: "failed" });
    expect(ops()).not.toContain("container.run");
    // Asleep for Caddy and the database, its container still named for the retry.
    expect(byId(rows, "live-2")).toMatchObject({
      status: "asleep",
      container: prName(2, "2"),
    });

    stopFails = false;
    calls.length = 0;
    rows.push(queued("p5b", "6", 11, 5));
    const [second] = await processProject(d, "p1");
    expect(second).toMatchObject({ id: "p5b", result: "live" });
    // The leftover goes, and no live preview is put to sleep for it.
    expect(asleepWrites(calls)).toEqual([]);
    expect(
      calls.filter((c) => c.op === "container.stop").map((c) => c.params),
    ).toEqual([{ name: prName(2, "2") }]);
    expect(byId(rows, "live-2")?.container).toBeNull();
    for (const pr of [1, 3, 4])
      expect(byId(rows, `live-${pr}`)?.status).toBe("live");
  });

  test("two pushes at once: never five running, never the same one put to sleep twice", async () => {
    const rows = [...fourLive(), queued("p5", "5", 10, 5)];
    const base = memoryRepo(rows);
    // The real repo's advisory lock, as a mutex: the second switch waits for the first.
    let tail: Promise<unknown> = Promise.resolve();
    let locks = 0;
    const repo: SwitchRepo = {
      ...base,
      withProjectLock(id, fn) {
        locks++;
        const run = tail.then(() => base.withProjectLock(id, fn));
        tail = run.catch(() => undefined);
        return run;
      },
    };
    const running = new Set(
      rows.flatMap((r) => (r.pr && r.container ? [r.container] : [])),
    );
    let most = running.size;
    let second: Promise<unknown> | null = null;
    const { agent, calls } = fakeAgent({
      "image.pull": (p) => {
        // While the first switch pulls, PR 6 is pushed and its own request starts a switch.
        if (!second) {
          rows.push(queued("p6", "6", 11, 6));
          second = processProject(d, "p1");
        }
        return ok({ image: p.image });
      },
      "container.run": (p) => {
        const t = p.target as { pr: number };
        running.add(prName(t.pr, String(p.sha).slice(0, 1)));
        most = Math.max(most, running.size);
        return ok({ name: "x", id: "abc" });
      },
      "container.stop": (p) => {
        running.delete(String(p.name));
        return ok({ name: p.name });
      },
    });
    const { d } = deps(agent, repo);

    await processProject(d, "p1");
    await second;

    expect(locks).toBe(2);
    expect(most).toBe(4);
    const slept = asleepWrites(calls).map((c) => c.params.pr);
    expect(slept).toEqual([2, 3]); // the two oldest, once each
    expect(rows.filter((r) => r.pr && r.status === "live")).toHaveLength(4);
    expect(
      rows
        .filter((r) => r.pr && r.status === "live")
        .map((r) => r.pr)
        .sort(),
    ).toEqual([1, 4, 5, 6]);
  });
});
