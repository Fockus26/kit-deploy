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
import { drizzleEnrolmentStore } from "../../lib/auth/store";
import * as schema from "../../lib/db/schema";
import { deployments, deployTokens, projects } from "../../lib/db/schema";
import { drizzleStore } from "../../lib/db/store";
import { drizzlePreviewStore } from "../../lib/preview/store";
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

    expect(await store.findOpenDeployment(p.id, { pr: null }, SHA)).toBeNull();
    const input = {
      projectId: p.id,
      environment: "production",
      sha: SHA,
      image: `ghcr.io/fockus26/kd-hello:${SHA}`,
    } as const;
    const d = await store.createDeployment(input);
    expect(d?.status).toBe("queued");
    expect(await store.findOpenDeployment(p.id, { pr: null }, SHA)).toEqual(d);
    // The partial unique index: a second open deployment of the same commit is refused.
    expect(await store.createDeployment(input)).toBeNull();

    await db.update(deployments).set({ status: "failed" });
    expect(await store.findOpenDeployment(p.id, { pr: null }, SHA)).toBeNull();
    // Once it failed, the same commit can be queued again.
    const again = await store.createDeployment(input);
    expect(again).not.toBeNull();

    // The same commit as a preview of PR 7 and of PR 8: each its own open deployment, and each
    // refuses its own twin; production's is untouched.
    const preview = (pr: number) =>
      ({ ...input, environment: "preview", pr }) as const;
    const p7 = await store.createDeployment(preview(7));
    const p8 = await store.createDeployment(preview(8));
    expect(p7).not.toBeNull();
    expect(p8).not.toBeNull();
    expect(await store.createDeployment(preview(7))).toBeNull();
    expect(await store.findOpenDeployment(p.id, { pr: 7 }, SHA)).toEqual(p7);
    expect(await store.findOpenDeployment(p.id, { pr: 8 }, SHA)).toEqual(p8);
    expect(await store.findOpenDeployment(p.id, { pr: 9 }, SHA)).toBeNull();
    expect(await store.findOpenDeployment(p.id, { pr: null }, SHA)).toEqual(
      again,
    );

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

describe.skipIf(!url)("preview access + enrolment stores (Postgres)", () => {
  const client = postgres(url ?? "", { max: 4, onnotice: () => {} });
  const db = drizzle(client, { schema });
  const previews = drizzlePreviewStore(db);
  const enrolments = drizzleEnrolmentStore(db);
  const HOST = "kd-hello-pr-7.preview.fockus.dev";
  const T = new Date("2026-11-14T12:00:00Z");
  const later = (ms: number) => new Date(T.getTime() + ms);

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "drizzle" }); // no-op after the suite above
    await db
      .insert(schema.authUser)
      .values({ id: "u-prev", email: "p@example.com", name: "p" });
  });
  afterAll(() => client.end());

  test("a grant is redeemed once, for its host, before it expires", async () => {
    const hash = "a".repeat(64);
    await previews.createGrant({
      userId: "u-prev",
      tokenHash: hash,
      host: HOST,
      path: "/x?y=1",
      expiresAt: later(60_000),
    });
    expect(
      await previews.redeemGrant(hash, "other.preview.fockus.dev", T),
    ).toBeNull();
    expect(await previews.redeemGrant(hash, HOST, later(61_000))).toBeNull();
    // Two at once: exactly one wins.
    const both = await Promise.all([
      previews.redeemGrant(hash, HOST, T),
      previews.redeemGrant(hash, HOST, T),
    ]);
    expect(both.filter(Boolean)).toEqual([
      { userId: "u-prev", path: "/x?y=1" },
    ]);
  });

  test("a session is found until it expires, and goes with its user", async () => {
    const hash = "b".repeat(64);
    await previews.createSession({
      userId: "u-prev",
      tokenHash: hash,
      expiresAt: later(3_600_000),
    });
    const found = await previews.findSession(hash, T);
    expect(found?.userId).toBe("u-prev");
    expect(found?.expiresAt.getTime()).toBe(later(3_600_000).getTime());
    expect(await previews.findSession(hash, later(3_600_001))).toBeNull();
    expect(await previews.findSession("c".repeat(64), T)).toBeNull();
  });

  test("enrolment links redeem once against real Postgres", async () => {
    const hash = "d".repeat(64);
    await db.insert(schema.enrolmentTokens).values({
      userId: "u-prev",
      tokenHash: hash,
      expiresAt: later(900_000),
    });
    expect(await enrolments.redeem(hash, later(900_001))).toBeNull();
    expect(await enrolments.redeem(hash, T)).toBe("u-prev");
    expect(await enrolments.redeem(hash, T)).toBeNull();
  });

  test("deleting the account removes its grants and sessions", async () => {
    await db.delete(schema.authUser).where(sql`id = 'u-prev'`);
    expect(await previews.findSession("b".repeat(64), T)).toBeNull();
    const left = await db.execute(
      sql`select (select count(*) from preview_grants) + (select count(*) from preview_sessions) as n`,
    );
    expect(Number((left as unknown as { n: string }[])[0]?.n)).toBe(0);
  });
});
