/**
 * The Drizzle store and the migration against a real Postgres. Opt-in: needs a throwaway database
 * in Docker (never the real kit_deploy), e.g.
 *
 *   docker run -d --name kd-pg-test -e POSTGRES_PASSWORD=test -p 127.0.0.1:55432:5432 postgres:17
 *   KIT_DB_TEST_URL=postgres://postgres:test@127.0.0.1:55432/postgres bun test tests/unit/db-store.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "../../lib/db/schema";
import { deployments, deployTokens, projects } from "../../lib/db/schema";
import { drizzleStore } from "../../lib/db/store";
import { generateDeployToken } from "../../lib/tokens";

const url = process.env.KIT_DB_TEST_URL;
/** Drizzle builders are thenables, not Promises: `expect().rejects` needs a real one. */
const rejects = (q: PromiseLike<unknown>) =>
  expect(Promise.resolve(q)).rejects.toThrow();
const SHA = "3f2a9c1e7b4d5a6f8e9c0b1a2d3e4f5a6b7c8d9e";

describe.skipIf(!url)("drizzle store (Postgres)", () => {
  const client = postgres(url ?? "", { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });
  const store = drizzleStore(db);

  beforeAll(async () => {
    await db.execute(sql`drop schema if exists public cascade`);
    await db.execute(sql`drop schema if exists drizzle cascade`);
    await db.execute(sql`create schema public`);
    await migrate(db, { migrationsFolder: "drizzle" });
  });
  afterAll(() => client.end());

  test("token → project, open deployment, revoked token", async () => {
    const [p] = await db
      .insert(projects)
      .values({ name: "kd_hello", repo: "Fockus26/kd-hello" })
      .returning();
    if (!p) throw new Error("no project");
    const { hash } = generateDeployToken();
    const [t] = await db
      .insert(deployTokens)
      .values({ projectId: p.id, tokenHash: hash })
      .returning();
    if (!t) throw new Error("no token");

    expect(await store.findTokenProject(hash)).toEqual({
      tokenId: t.id,
      project: { id: p.id, name: "kd_hello", repo: "Fockus26/kd-hello" },
    });
    await store.touchToken(t.id);

    expect(await store.findOpenDeployment(p.id, SHA)).toBeNull();
    const input = {
      projectId: p.id,
      environment: "production",
      sha: SHA,
      image: `ghcr.io/fockus26/kd-hello:${SHA}`,
    } as const;
    const d = await store.createDeployment(input);
    expect(d?.status).toBe("queued");
    expect(await store.findOpenDeployment(p.id, SHA)).toEqual(d);
    // The partial unique index: a second open deployment of the same commit is refused.
    expect(await store.createDeployment(input)).toBeNull();

    await db.update(deployments).set({ status: "failed" });
    expect(await store.findOpenDeployment(p.id, SHA)).toBeNull();
    // Once it failed, the same commit can be queued again.
    expect(await store.createDeployment(input)).not.toBeNull();

    await db.update(deployTokens).set({ revokedAt: new Date() });
    expect(await store.findTokenProject(hash)).toBeNull();
  });

  test("the database enforces the formats", async () => {
    await rejects(db.insert(projects).values({ name: "x1", repo: "../x" }));
    await rejects(db.insert(projects).values({ name: "x2", repo: "a/.b" }));
    await rejects(
      db.insert(projects).values({ name: "Bad-Name", repo: "a/b" }),
    );
    await rejects(
      db.insert(deployTokens).values({
        projectId: "00000000-0000-0000-0000-000000000000",
        tokenHash: "plaintext-token",
      }),
    );
    const [p] = await db.select().from(projects).limit(1);
    if (!p) throw new Error("no project");
    await rejects(
      db.execute(
        sql`insert into deployments (project_id, environment, sha, image, status) values (${p.id}, 'production', ${SHA}, 'x', 'bogus')`,
      ),
    );
    await rejects(
      db.insert(deployments).values({
        projectId: p.id,
        environment: "production",
        pr: 3,
        sha: SHA,
        image: "x",
      }),
    );
  });
});
