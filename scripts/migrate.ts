/**
 * Applies drizzle/ to kit_deploy. Compiled into the release as `bin/kit-deploy-migrate`
 * (`bun build --compile`), so the VPS needs neither bun nor node_modules.
 *
 *   DATABASE_URL=… kit-deploy-migrate [<migrations dir>]   default: ../drizzle next to the binary
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const folder =
  process.argv[2] ?? join(dirname(process.execPath), "..", "drizzle");
if (!existsSync(join(folder, "meta", "_journal.json"))) {
  console.error(`no migrations in ${folder}`);
  process.exit(1);
}

const client = postgres(url, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(client), { migrationsFolder: folder });
  const [row] = await client<{ n: number }[]>`
    select count(*)::int as n from drizzle.__drizzle_migrations`;
  console.log(`migrations applied: ${row?.n ?? 0}`);
} catch (e) {
  // The message only: a postgres error never carries the password, the URL is never printed.
  // Drizzle wraps the driver's error: the cause is the part that says why.
  const err = e as Error & { cause?: Error };
  console.error(
    `migration failed: ${err.message}${err.cause ? ` — ${err.cause.message}` : ""}`,
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
