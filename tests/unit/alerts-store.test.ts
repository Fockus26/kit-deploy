/**
 * lib/alerts/store.ts against a real Postgres. Opt-in, like db-store.test.ts: a throwaway database
 * in Docker (never the real kit_deploy):
 *
 *   docker run -d --name kd-pg-test -e POSTGRES_PASSWORD=test -p 127.0.0.1:55432:5432 postgres:17
 *   KIT_DB_TEST_URL=postgres://postgres:test@127.0.0.1:55432/postgres bun test tests/unit/alerts-store.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { renderDigest } from "../../lib/alerts/email";
import { type Digest, evaluate, notify } from "../../lib/alerts/engine";
import {
  drizzleAlertStore,
  drizzleAlertsReader,
  drizzleCheckRepo,
} from "../../lib/alerts/store";
import * as schema from "../../lib/db/schema";
import { auditLog, deployments, domains, projects } from "../../lib/db/schema";

const url = process.env.KIT_DB_TEST_URL;
const ALL = new Set(schema.ALERT_KINDS);

describe.skipIf(!url)("alerts store (Postgres)", () => {
  const client = postgres(url ?? "", { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });

  beforeAll(async () => {
    await db.execute(sql`drop schema if exists public cascade`);
    await db.execute(sql`drop schema if exists drizzle cascade`);
    await db.execute(sql`create schema public`);
    await migrate(db, { migrationsFolder: "drizzle" });
  });
  afterAll(() => client.end());

  test("open, one row per key, notify once, resolve, notify the resolution", async () => {
    const store = drizzleAlertStore(db);
    const o = {
      key: "site_down:shop",
      kind: "site_down" as const,
      project: "shop",
      failing: true,
      title: "shop no responde",
      detail: "/api/health respondió 502.",
    };
    const t = (m: number) => new Date(Date.UTC(2026, 10, 18, 12, m));
    for (const m of [0, 1, 2, 3]) await evaluate(store, [o], ALL, t(m));
    const open = await store.openAlerts();
    expect(open).toHaveLength(1);
    expect(open[0]?.lastSeenAt).toEqual(t(3));
    // A second insert for the same open key is ignored.
    await store.open(o, t(4));
    expect(await store.openAlerts()).toHaveLength(1);

    const sent: Digest[] = [];
    const mailer = { send: async (d: Digest) => void sent.push(d) };
    expect(await notify(store, mailer, renderDigest, t(4))).toEqual({
      sent: 1,
    });
    expect(await notify(store, mailer, renderDigest, t(5))).toEqual({
      sent: 0,
    });

    for (const m of [6, 7, 8, 9, 10])
      await evaluate(store, [{ ...o, failing: false, detail: "" }], ALL, t(m));
    expect(await store.openAlerts()).toHaveLength(0);
    expect(await notify(store, mailer, renderDigest, t(11))).toEqual({
      sent: 1,
    });
    expect(sent.map((d) => d.subject)).toEqual([
      "[kit-deploy] Abierta: shop no responde",
      "[kit-deploy] Resuelta: shop no responde",
    ]);
    const all = await drizzleAlertsReader(db).recent(10);
    expect(all[0]).toMatchObject({
      resolvedAt: t(10),
      notifiedAt: t(4),
      resolvedNotifiedAt: t(11),
    });

    // Reopening the same key later is a new row.
    for (const m of [20, 21, 22]) await evaluate(store, [o], ALL, t(m));
    expect(await drizzleAlertsReader(db).recent(10)).toHaveLength(2);

    await store.pruneStreaks(t(60 * 24 * 2));
    expect((await store.streaks()).size).toBe(0);
  });

  test("the check repo: live sites, stopped on purpose, last production deploy, certs", async () => {
    const [p] = await db
      .insert(projects)
      .values({ name: "shop", repo: "Fockus26/shop" })
      .returning();
    const [q] = await db
      .insert(projects)
      .values({ name: "blog", repo: "Fockus26/blog" })
      .returning();
    if (!p || !q) throw new Error("no project");
    const sha = (c: string) => c.repeat(40);
    await db.insert(deployments).values([
      {
        projectId: p.id,
        environment: "production",
        sha: sha("a"),
        image: "i",
        status: "live",
        container: "kd-shop-a",
        port: 20001,
        createdAt: new Date("2026-11-18T10:00:00Z"),
      },
      {
        projectId: p.id,
        environment: "production",
        sha: sha("b"),
        image: "i",
        status: "failed",
        error: "boom",
        createdAt: new Date("2026-11-18T11:00:00Z"),
      },
      {
        projectId: q.id,
        environment: "production",
        sha: sha("c"),
        image: "i",
        status: "live",
        container: "kd-blog-c",
        port: 20002,
        createdAt: new Date("2026-11-18T09:00:00Z"),
      },
    ]);
    await db.insert(auditLog).values([
      {
        actor: "web:u1",
        action: "project.stop",
        project: "blog",
        at: new Date("2026-11-18T09:30:00Z"),
      },
      {
        actor: "web:u1",
        action: "project.restart",
        project: "shop",
        at: new Date("2026-11-18T09:00:00Z"),
      },
      {
        actor: "web:u1",
        action: "project.stop",
        project: "shop",
        at: new Date("2026-11-18T08:00:00Z"),
      },
    ]);
    await db.insert(domains).values({
      projectId: p.id,
      host: "shop.com",
      status: "ready",
      certNotAfter: new Date("2027-01-01T00:00:00Z"),
    });
    const repo = drizzleCheckRepo(db);
    expect(await repo.liveSites()).toEqual([
      {
        project: "blog",
        container: "kd-blog-c",
        port: 20002,
        stoppedOnPurpose: true,
      },
      {
        project: "shop",
        container: "kd-shop-a",
        port: 20001,
        stoppedOnPurpose: false,
      },
    ]);
    const last = await repo.lastProductionDeploys();
    expect(last.map((d) => [d.project, d.status]).sort()).toEqual([
      ["blog", "live"],
      ["shop", "failed"],
    ]);
    expect(await repo.domainCerts()).toEqual([
      {
        project: "shop",
        host: "shop.com",
        certNotAfter: new Date("2027-01-01T00:00:00Z"),
        status: "ready",
      },
    ]);
    expect(await repo.vps()).toBeNull();
  });
});
