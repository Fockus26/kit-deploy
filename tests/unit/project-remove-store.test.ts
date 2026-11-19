/**
 * lib/db/project-remove.ts against a real Postgres. Opt-in, like cron-store.test.ts:
 *
 *   docker run -d --name kd-pg-test -e POSTGRES_PASSWORD=test -p 127.0.0.1:55432:5432 postgres:17
 *   KIT_DB_TEST_URL=postgres://postgres:test@127.0.0.1:55432/postgres bun test tests/unit/project-remove-store.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { drizzleProjectRemovalStore } from "../../lib/db/project-remove";
import * as schema from "../../lib/db/schema";

const url = process.env.KIT_DB_TEST_URL;
const audit = {
  actor: "ssh:cesar",
  action: "project.remove" as const,
  project: "kd_hello",
  environment: null,
  name: "Fockus26/kd-hello",
};

describe.skipIf(!url)("project removal store (Postgres)", () => {
  const client = postgres(url ?? "", { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });

  beforeAll(async () => {
    await db.execute(sql`drop schema if exists public cascade`);
    await db.execute(sql`drop schema if exists drizzle cascade`);
    await db.execute(sql`create schema public`);
    await migrate(db, { migrationsFolder: "drizzle" });
  });
  afterAll(() => client.end());

  test("footprint, then every row gone in one go; alerts closed, audit kept; twice is fine", async () => {
    const [p] = await db
      .insert(schema.projects)
      .values({ name: "kd_hello", repo: "Fockus26/kd-hello" })
      .returning();
    const [other] = await db
      .insert(schema.projects)
      .values({ name: "shop", repo: "Fockus26/shop" })
      .returning();
    if (!p || !other) throw new Error("no project");
    await db.insert(schema.domains).values([
      { projectId: p.id, host: "kd-hello.fockus.dev" },
      { projectId: other.id, host: "shop.fockus.dev" },
    ]);
    await db.insert(schema.deployments).values([
      {
        projectId: p.id,
        environment: "production",
        sha: "a".repeat(40),
        image: "ghcr.io/fockus26/kd-hello:a",
      },
      {
        projectId: p.id,
        environment: "preview",
        pr: 3,
        sha: "b".repeat(40),
        image: "ghcr.io/fockus26/kd-hello:b",
      },
    ]);
    await db.insert(schema.deployTokens).values({
      projectId: p.id,
      tokenHash: "c".repeat(64),
      label: "ci",
    });
    await db.insert(schema.cronJobs).values({
      projectId: p.id,
      path: "/api/cron",
      schedule: "0 3 * * *",
    });
    await db.insert(schema.alerts).values([
      {
        key: "site_down:kd_hello",
        kind: "site_down",
        project: "kd_hello",
        title: "x",
      },
      { key: "site_down:shop", kind: "site_down", project: "shop", title: "y" },
    ]);
    await db.insert(schema.alertChecks).values([
      { key: "site_down:kd_hello", failing: true },
      { key: "cert:kd-hello.fockus.dev", failing: false },
      { key: "site_down:shop", failing: true },
    ]);

    const store = drizzleProjectRemovalStore(db);
    expect(await store.footprint("kd_hello")).toEqual({
      repo: "Fockus26/kd-hello",
      deployments: 2,
      previews: 1,
      hosts: ["kd-hello.fockus.dev"],
      variables: 0,
      tokens: 1,
      cronJobs: 1,
      openAlerts: 1,
    });
    expect(await store.remove("kd_hello", audit)).toBe(true);
    expect(await store.footprint("kd_hello")).toBeNull();
    expect(await store.remove("kd_hello", audit)).toBe(false);

    const left = async (t: typeof schema.deployments | typeof schema.domains) =>
      (await db.select().from(t)).length;
    expect(await left(schema.deployments)).toBe(0);
    expect(await left(schema.domains)).toBe(1);
    expect((await db.select().from(schema.deployTokens)).length).toBe(0);
    expect((await db.select().from(schema.cronJobs)).length).toBe(0);
    const checks = await db.select().from(schema.alertChecks);
    expect(checks.map((c) => c.key)).toEqual(["site_down:shop"]);
    const [closed] = await db
      .select()
      .from(schema.alerts)
      .where(eq(schema.alerts.project, "kd_hello"));
    expect(closed?.resolvedAt).not.toBeNull();
    expect(closed?.resolvedNotifiedAt).not.toBeNull();
    const [shop] = await db
      .select()
      .from(schema.alerts)
      .where(eq(schema.alerts.project, "shop"));
    expect(shop?.resolvedAt).toBeNull();
    const rows = await db.select().from(schema.auditLog);
    expect(rows.map((r) => [r.action, r.project, r.name])).toEqual([
      ["project.remove", "kd_hello", "Fockus26/kd-hello"],
    ]);
  });
});
