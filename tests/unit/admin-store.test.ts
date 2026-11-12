/**
 * `drizzleAdminStore` against a real Postgres. Opt-in, like db-store.test.ts (KIT_DB_TEST_URL).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { AdminError, drizzleAdminStore } from "../../lib/db/admin";
import * as schema from "../../lib/db/schema";
import { deployTokens, domains, projects } from "../../lib/db/schema";
import { drizzleStore } from "../../lib/db/store";
import { generateDeployToken } from "../../lib/tokens";

const url = process.env.KIT_DB_TEST_URL;

describe.skipIf(!url)("drizzle admin store (Postgres)", () => {
  const client = postgres(url ?? "", { max: 2, onnotice: () => {} });
  const db = drizzle(client, { schema });
  const admin = drizzleAdminStore(db);

  beforeAll(async () => {
    await db.execute(sql`drop schema if exists public cascade`);
    await db.execute(sql`drop schema if exists drizzle cascade`);
    await db.execute(sql`create schema public`);
    await migrate(db, { migrationsFolder: "drizzle" });
  });
  afterAll(() => client.end());

  test("project with its domains, in one go", async () => {
    await admin.addProject({
      name: "kd_hello",
      repo: "Fockus26/kd-hello",
      memoryMb: 256,
      hosts: ["kd-hello.fockus.dev"],
    });
    const [p] = await db
      .select()
      .from(projects)
      .where(eq(projects.name, "kd_hello"));
    expect(p).toMatchObject({ repo: "Fockus26/kd-hello", memoryMb: 256 });
    expect((await db.select().from(domains)).map((d) => d.host)).toEqual([
      "kd-hello.fockus.dev",
    ]);
  });

  test("a taken host rolls the whole project back", async () => {
    await expect(
      admin.addProject({
        name: "other",
        repo: "Fockus26/other",
        memoryMb: 512,
        hosts: ["kd-hello.fockus.dev"],
      }),
    ).rejects.toThrow(AdminError);
    expect(
      await db.select().from(projects).where(eq(projects.name, "other")),
    ).toEqual([]);
  });

  test("addDomain, and a duplicate or unknown project is an AdminError", async () => {
    await admin.addDomain("kd_hello", "hola.example.com");
    await expect(
      admin.addDomain("kd_hello", "hola.example.com"),
    ).rejects.toThrow("already belongs");
    await expect(admin.addDomain("nope", "x.example.com")).rejects.toThrow(
      "no project nope",
    );
  });

  test("a token created here authenticates the deploy API's lookup", async () => {
    const { token, hash } = generateDeployToken();
    await admin.addToken("kd_hello", hash, "github actions");
    const [row] = await db.select().from(deployTokens);
    expect(row).toMatchObject({ tokenHash: hash, label: "github actions" });
    const found = await drizzleStore(db).findTokenProject(hash);
    expect(found?.project.name).toBe("kd_hello");
    expect(JSON.stringify(await db.select().from(deployTokens))).not.toContain(
      token,
    );
  });
});
