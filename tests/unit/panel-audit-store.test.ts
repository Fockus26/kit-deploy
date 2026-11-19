/**
 * Ajustes › Auditoría's reads (D063) against a real Postgres. Opt-in, like db-store.test.ts: a
 * throwaway database in Docker (never the real kit_deploy):
 *
 *   docker run -d --name kd-pg-test -e POSTGRES_PASSWORD=test -p 127.0.0.1:55432:5432 postgres:17
 *   KIT_DB_TEST_URL=postgres://postgres:test@127.0.0.1:55432/postgres bun test tests/unit/panel-audit-store.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "../../lib/db/schema";
import { auditLog } from "../../lib/db/schema";
import { AUDIT_PAGE, drizzlePanelStore } from "../../lib/panel/data/store";

const url = process.env.KIT_DB_TEST_URL;

describe.skipIf(!url)(
  "panel store: audit offset / limit / count (Postgres)",
  () => {
    const client = postgres(url ?? "", { max: 1, onnotice: () => {} });
    const db = drizzle(client, { schema });
    const store = drizzlePanelStore(db);

    beforeAll(async () => {
      await db.execute(sql`drop schema if exists public cascade`);
      await db.execute(sql`drop schema if exists drizzle cascade`);
      await db.execute(sql`create schema public`);
      await migrate(db, { migrationsFolder: "drizzle" });
      // 45 rows, a minute apart (i = 0 is the newest), two of them in the same instant.
      const t0 = Date.UTC(2026, 10, 18, 12, 0);
      await db.insert(auditLog).values(
        Array.from({ length: 45 }, (_, i) => ({
          actor: "web:u1",
          action: "project.stop",
          project: `p${i}`,
          at: new Date(t0 - Math.min(i, 30) * 60_000),
        })),
      );
    });
    afterAll(() => client.end());

    test("count is the total, not the page", async () => {
      expect(await store.auditCount()).toBe(45);
    });

    test("pages of 20 do not repeat or skip a row, even with equal timestamps", async () => {
      const pages = [
        await store.audit({ offset: 0, limit: AUDIT_PAGE }),
        await store.audit({ offset: 20, limit: AUDIT_PAGE }),
        await store.audit({ offset: 40, limit: AUDIT_PAGE }),
      ];
      expect(pages.map((p) => p.length)).toEqual([20, 20, 5]);
      const ids = pages.flat().map((r) => r.id);
      expect(new Set(ids).size).toBe(45);
      const times = pages.flat().map((r) => +r.at);
      expect(times).toEqual([...times].sort((a, b) => b - a));
    });

    test("no options: the first page; a limit above a page is capped; past the end is empty", async () => {
      expect(await store.audit()).toHaveLength(AUDIT_PAGE);
      expect(await store.audit({ limit: 500 })).toHaveLength(AUDIT_PAGE);
      expect(await store.audit({ offset: 45 })).toEqual([]);
    });
  },
);
