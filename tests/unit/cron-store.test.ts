/**
 * lib/cron/store.ts against a real Postgres. Opt-in, like db-store.test.ts:
 *
 *   docker run -d --name kd-pg-test -e POSTGRES_PASSWORD=test -p 127.0.0.1:55432:5432 postgres:17
 *   KIT_DB_TEST_URL=postgres://postgres:test@127.0.0.1:55432/postgres bun test tests/unit/cron-store.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { drizzleCronStore } from "../../lib/cron/store";
import * as schema from "../../lib/db/schema";
import { auditLog, deployments, envVars, projects } from "../../lib/db/schema";

const url = process.env.KIT_DB_TEST_URL;
const audit = (action: "cron.add" | "cron.remove" | "cron.disable") => ({
  actor: "ssh:cesar",
  action,
  project: "shop",
  environment: "production" as const,
  name: "/api/cron/daily 0 3 * * *",
});

describe.skipIf(!url)("cron store (Postgres)", () => {
  const client = postgres(url ?? "", { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });

  beforeAll(async () => {
    await db.execute(sql`drop schema if exists public cascade`);
    await db.execute(sql`drop schema if exists drizzle cascade`);
    await db.execute(sql`create schema public`);
    await migrate(db, { migrationsFolder: "drizzle" });
  });
  afterAll(() => client.end());

  test("jobs, one run per slot, runs newest first, secret row, live port, audit", async () => {
    const [p] = await db
      .insert(projects)
      .values({ name: "shop", repo: "Fockus26/shop" })
      .returning();
    if (!p) throw new Error("no project");
    const store = drizzleCronStore(db);
    const job = await store.add(
      "shop",
      "/api/cron/daily",
      "0 3 * * *",
      audit("cron.add"),
    );
    await expect(
      store.add("shop", "/api/cron/daily", "0 3 * * *", audit("cron.add")),
    ).rejects.toThrow("already calls");
    await expect(
      store.add("nope", "/x", "* * * * *", audit("cron.add")),
    ).rejects.toThrow("no project nope");
    // The path check in the table: no `..`.
    await expect(
      Promise.resolve(
        db
          .insert(schema.cronJobs)
          .values({ projectId: p.id, path: "/a/../b", schedule: "* * * * *" }),
      ),
    ).rejects.toThrow();
    expect((await store.jobs("shop")).map((j) => j.path)).toEqual([
      "/api/cron/daily",
    ]);

    const slot = new Date("2026-11-18T03:00:00Z");
    const run = await store.claim(
      job.id,
      slot,
      new Date("2026-11-18T03:00:01Z"),
    );
    expect(run).not.toBeNull();
    expect(
      await store.claim(job.id, slot, new Date("2026-11-18T03:00:02Z")),
    ).toBeNull();
    await store.finish(
      run as string,
      { status: "ok", httpStatus: 200, durationMs: 42, error: null },
      new Date("2026-11-18T03:00:02Z"),
    );
    const later = await store.claim(
      job.id,
      new Date("2026-11-19T03:00:00Z"),
      new Date("2026-11-19T03:00:01Z"),
    );
    await store.finish(
      later as string,
      {
        status: "failed",
        httpStatus: 500,
        durationMs: 3,
        error: "x".repeat(1000),
      },
      new Date("2026-11-19T03:00:02Z"),
    );
    const runs = await store.runs("shop", 10);
    expect(runs.map((r) => [r.status, r.httpStatus, r.path])).toEqual([
      ["failed", 500, "/api/cron/daily"],
      ["ok", 200, "/api/cron/daily"],
    ]);
    expect(runs[0]?.error).toHaveLength(300);
    await store.pruneRuns(new Date("2026-11-19T00:00:00Z"));
    expect(await store.runs("shop", 10)).toHaveLength(1);

    expect(await store.cronSecret("shop")).toBeNull();
    await db.insert(envVars).values({
      projectId: p.id,
      environment: "production",
      name: "CRON_SECRET",
      secret: true,
      ciphertext: "Y2lwaGVy",
      iv: "aXZpdml2aXZpdml2",
      tag: "dGFndGFndGFndGFndGFndA==",
      keyVersion: 1,
      updatedBy: "ssh:cesar",
    });
    expect(await store.cronSecret("shop")).toEqual({
      name: "CRON_SECRET",
      secret: true,
      sealed: {
        ciphertext: "Y2lwaGVy",
        iv: "aXZpdml2aXZpdml2",
        tag: "dGFndGFndGFndGFndGFndA==",
        keyVersion: 1,
      },
    });

    expect(await store.livePort("shop")).toBeNull();
    await db.insert(deployments).values({
      projectId: p.id,
      environment: "production",
      sha: "a".repeat(40),
      image: "i",
      status: "live",
      container: "kd-shop-a",
      port: 20001,
    });
    expect(await store.livePort("shop")).toBe(20001);

    expect(
      await store.setEnabled("shop", job.id, false, audit("cron.disable")),
    ).toBe(true);
    expect((await store.jobs())[0]?.enabled).toBe(false);
    expect(await store.remove("shop", job.id, audit("cron.remove"))).toBe(true);
    expect(await store.remove("shop", job.id, audit("cron.remove"))).toBe(
      false,
    );
    const actions = (await db.select().from(auditLog)).map((a) => a.action);
    expect(actions).toEqual(["cron.add", "cron.disable", "cron.remove"]);
  });
});
