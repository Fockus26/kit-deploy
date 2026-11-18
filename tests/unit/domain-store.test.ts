/**
 * `drizzleDomainStore` and the switch repo's served hosts against a real Postgres. Opt-in, like
 * db-store.test.ts (KIT_DB_TEST_URL).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { drizzleAdminStore } from "../../lib/db/admin";
import * as schema from "../../lib/db/schema";
import { drizzleSwitchRepo } from "../../lib/deploy/drizzle-repo";
import { drizzleDomainStore } from "../../lib/domains/store";

const url = process.env.KIT_DB_TEST_URL;

describe.skipIf(!url)("drizzle domain store (Postgres)", () => {
  const client = postgres(url ?? "", { max: 2, onnotice: () => {} });
  const db = drizzle(client, { schema });
  const admin = drizzleAdminStore(db);
  const store = drizzleDomainStore(db);

  beforeAll(async () => {
    await db.execute(sql`drop schema if exists public cascade`);
    await db.execute(sql`drop schema if exists drizzle cascade`);
    await db.execute(sql`create schema public`);
    await migrate(db, { migrationsFolder: "drizzle" });
    await admin.addProject({
      name: "shop",
      repo: "Fockus26/shop",
      memoryMb: 256,
      hosts: ["shop.fockus.dev"],
    });
    await admin.addDomain("shop", "example.com");
    await admin.addDomain("shop", "www.example.com", "to_apex");
  });
  afterAll(() => client.end());

  test("new hosts start pending; only pointed ones (and the default) reach the site", async () => {
    const rows = await store.list("shop");
    expect(rows.map((r) => [r.host, r.status, r.redirect])).toEqual([
      ["example.com", "pending_dns", "none"],
      ["shop.fockus.dev", "pending_dns", "none"],
      ["www.example.com", "pending_dns", "to_apex"],
    ]);
    const repo = drizzleSwitchRepo(db);
    expect(await repo.projectByName("shop")).toMatchObject({
      hosts: ["shop.fockus.dev"],
      redirects: [],
    });
    const now = new Date();
    for (const r of rows)
      await store.update(r.id, { status: "issuing", dnsOkAt: now });
    expect(await repo.projectByName("shop")).toMatchObject({
      hosts: ["example.com", "shop.fockus.dev"],
      redirects: [{ from: "www.example.com", to: "example.com" }],
    });
  });

  test("a long error is cut; an unknown status is refused by the table", async () => {
    const [r] = await store.list("shop");
    if (!r) throw new Error("no row");
    await store.update(r.id, { lastError: "x".repeat(1000) });
    expect((await store.list("shop"))[0]?.lastError?.length).toBe(300);
    await expect(
      db.execute(sql`update domains set status = 'weird' where id = ${r.id}`),
    ).rejects.toThrow();
  });

  test("setRedirect and remove report whether the host was the project's", async () => {
    expect(await store.setRedirect("shop", "example.com", "to_www")).toBe(true);
    expect(await store.setRedirect("shop", "nope.com", "to_www")).toBe(false);
    expect(await store.remove("shop", "www.example.com")).toBe(true);
    expect(await store.remove("shop", "www.example.com")).toBe(false);
  });
});
