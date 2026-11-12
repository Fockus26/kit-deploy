/**
 * `drizzleSwitchRepo` against a real Postgres. Opt-in, like db-store.test.ts:
 *
 *   docker run -d --name kd-pg-test -e POSTGRES_PASSWORD=test -p 127.0.0.1:55432:5432 postgres:17
 *   KIT_DB_TEST_URL=postgres://postgres:test@127.0.0.1:55432/postgres bun test tests/unit/deploy-repo.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "../../lib/db/schema";
import { deployments, domains, projects } from "../../lib/db/schema";
import { drizzleSwitchRepo } from "../../lib/deploy/drizzle-repo";

const url = process.env.KIT_DB_TEST_URL;
const sha = (c: string) => c.repeat(40);

describe.skipIf(!url)("drizzle switch repo (Postgres)", () => {
  const client = postgres(url ?? "", { max: 4, onnotice: () => {} });
  const db = drizzle(client, { schema });
  const repo = drizzleSwitchRepo(db);
  let projectId = "";

  const queue = async (s: string, minutesAgo: number) => {
    const [d] = await db
      .insert(deployments)
      .values({
        projectId,
        environment: "production",
        sha: s,
        image: `ghcr.io/fockus26/kd-hello:${s}`,
        createdAt: new Date(Date.now() - minutesAgo * 60_000),
      })
      .returning();
    if (!d) throw new Error("no row");
    return d.id;
  };
  const statusOf = async (id: string) =>
    (await db.select().from(deployments).where(eq(deployments.id, id)))[0]
      ?.status;

  beforeAll(async () => {
    await db.execute(sql`drop schema if exists public cascade`);
    await db.execute(sql`drop schema if exists drizzle cascade`);
    await db.execute(sql`create schema public`);
    await migrate(db, { migrationsFolder: "drizzle" });
    const [p] = await db
      .insert(projects)
      .values({ name: "kd_hello", repo: "Fockus26/kd-hello", memoryMb: 256 })
      .returning();
    if (!p) throw new Error("no project");
    projectId = p.id;
    await db.insert(domains).values([
      { projectId, host: "www.hello.fockus.dev" },
      { projectId, host: "hello.fockus.dev" },
    ]);
  });
  afterAll(() => client.end());

  test("claimNext takes the newest queued, supersedes older ones, carries hosts and memory", async () => {
    const older = await queue(sha("a"), 5);
    const newer = await queue(sha("b"), 1);
    const c = await repo.claimNext(projectId);
    expect(c).toMatchObject({
      id: newer,
      sha: sha("b"),
      project: { id: projectId, name: "kd_hello", memoryMb: 256 },
      hosts: ["hello.fockus.dev", "www.hello.fockus.dev"],
    });
    expect(await statusOf(newer)).toBe("starting");
    expect(await statusOf(older)).toBe("superseded");
    expect(await repo.claimNext(projectId)).toBeNull();
  });

  test("markLive supersedes the previous live one and returns it; listKept and liveSites", async () => {
    const first = (await repo.listKept(projectId)).length;
    expect(first).toBe(0);
    const [starting] = await db
      .select()
      .from(deployments)
      .where(eq(deployments.status, "starting"));
    if (!starting) throw new Error("none starting");
    expect(
      await repo.markLive(starting.id, "kd_hello-prod-bbbbbbbbbbbb", 20401),
    ).toBeNull();

    const next = await queue(sha("c"), 0);
    await repo.claimNext(projectId);
    expect(
      await repo.markLive(next, "kd_hello-prod-cccccccccccc", 20402),
    ).toEqual({
      id: starting.id,
      container: "kd_hello-prod-bbbbbbbbbbbb",
    });

    const kept = await repo.listKept(projectId);
    expect(kept.map((k) => [k.status, k.container])).toEqual([
      ["live", "kd_hello-prod-cccccccccccc"],
      ["superseded", "kd_hello-prod-bbbbbbbbbbbb"],
    ]);
    expect(await repo.liveSites()).toEqual([
      {
        deploymentId: next,
        project: "kd_hello",
        hosts: ["hello.fockus.dev", "www.hello.fockus.dev"],
        container: "kd_hello-prod-cccccccccccc",
        port: 20402,
      },
    ]);

    await repo.clearContainer(starting.id);
    expect((await repo.listKept(projectId)).map((k) => k.id)).toEqual([next]);
  });

  test("markFailed records the error", async () => {
    const id = await queue(sha("d"), 0);
    await repo.claimNext(projectId);
    await repo.markFailed(id, "image.pull: command_failed: manifest unknown");
    const [row] = await db
      .select()
      .from(deployments)
      .where(eq(deployments.id, id));
    expect(row).toMatchObject({
      status: "failed",
      error: "image.pull: command_failed: manifest unknown",
    });
    expect(row?.finishedAt).toBeInstanceOf(Date);
  });

  test("projectByName", async () => {
    expect(await repo.projectByName("kd_hello")).toEqual({
      id: projectId,
      name: "kd_hello",
      repo: "Fockus26/kd-hello",
      memoryMb: 256,
      hosts: ["hello.fockus.dev", "www.hello.fockus.dev"],
    });
    expect(await repo.projectByName("nope")).toBeNull();
  });

  test("withProjectLock serializes two switches of the same project", async () => {
    const order: string[] = [];
    const run = (tag: string) =>
      repo.withProjectLock(projectId, async () => {
        order.push(`${tag} in`);
        await Bun.sleep(150);
        order.push(`${tag} out`);
      });
    await Promise.all([run("A"), run("B")]);
    expect(order).toHaveLength(4);
    expect(order[1]).toBe(order[0]?.replace("in", "out"));
  });

  test("the database refuses a platform host or a bad hostname", async () => {
    for (const host of [
      "db.fockus.dev",
      "Hello.fockus.dev",
      "127.0.0.1",
      "a..b",
    ]) {
      await expect(
        Promise.resolve(db.insert(domains).values({ projectId, host })),
      ).rejects.toThrow();
    }
  });
});
