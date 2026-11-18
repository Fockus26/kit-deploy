/**
 * QA only (D022): a signed-in browser for the local QA server, without a passkey. It creates
 * the `.env.test.local` account (EMAIL_TEST) in the qa-local database if it is missing, opens a
 * dashboard session for it through Better Auth's own test helpers (a separate auth instance
 * with the `testUtils` plugin; the app's auth never has it) and writes a Playwright
 * `storageState`. Refuses any database that is not this machine's `qa_<port>`.
 *
 *   bun run qa:local -- --port 4301              # wait for "QA ready: http://localhost:4301"
 *   bun scripts/qa-session.ts --port 4301        # → .qa/session.json (never printed)
 *   bun scripts/qa-session.ts --port 4301 --demo # also the demo projects (kd_hello, maranatha, …)
 *
 * Then, in a Playwright script in .qa/ (run with node):
 *   const context = await browser.newContext({ storageState: ".qa/session.json" });
 *
 * The database URL comes from the qa-local container (`docker port qa-kit-deploy-pg 5432`), or
 * from DATABASE_URL if set (it must still be 127.0.0.1/localhost and `qa_<port>`). The session
 * lasts 24 h (SESSION_TTL_SECONDS); run the script again after a `qa:local` reset.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { testUtils } from "better-auth/plugins";
import { AUTH_SCHEMA } from "../lib/auth";
import { authOptions } from "../lib/auth/config";
import { drizzleEnrolmentStore } from "../lib/auth/store";
import { projects } from "../lib/db/schema";
import { db } from "../lib/db/store";

/** The secret `scripts/qa-local.ts` gives the QA server: the cookie must be signed with it. */
const QA_SECRET = "qa-local-secret-qa-local-secret-qa-local";
const CONTAINER = "qa-kit-deploy-pg";
const OUT = ".qa/session.json";

/** Demo rows for the shell (never in a migration). One name has the maximum 40 characters. */
export const DEMO_PROJECTS = [
  { name: "kd_hello", repo: "demo-qa/kd-hello" },
  { name: "maranatha", repo: "demo-qa/maranatha" },
  { name: "tienda_en_linea_de_temporada_invierno_mx", repo: "demo-qa/tienda" },
] as const;

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

/** Only this machine's QA database for this port: `postgresql://…@127.0.0.1:<n>/qa_<port>`. */
export function isLocalQaDatabase(raw: string, port: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return (
    (url.protocol === "postgresql:" || url.protocol === "postgres:") &&
    (url.hostname === "127.0.0.1" || url.hostname === "localhost") &&
    url.pathname === `/qa_${port}` &&
    url.search === ""
  );
}

/** The qa-local container's database for this port (scripts/qa-seed.ts uses it too). */
export function containerUrl(port: string): string {
  let mapped: string;
  try {
    mapped = execFileSync("docker", ["port", CONTAINER, "5432"], {
      encoding: "utf8",
    });
  } catch {
    fail(
      `refused: no ${CONTAINER} container. Start it first: bun run qa:local -- --port ${port}`,
    );
  }
  const pgPort = /:(\d+)\s*$/m.exec(mapped.split("\n")[0] ?? "")?.[1];
  if (!pgPort) fail(`refused: could not read the port of ${CONTAINER}`);
  // The non-superuser role qa-local creates (scripts/qa-local.ts › Postgres).
  return `postgresql://qa_app:qa_app@127.0.0.1:${pgPort}/qa_${port}`;
}

function testEmail(): string {
  const file = ".env.test.local";
  if (!existsSync(file)) fail(`missing ${file} (EMAIL_TEST)`);
  const line = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("EMAIL_TEST="));
  const email = line
    ?.slice("EMAIL_TEST=".length)
    .trim()
    .replace(/^["']|["']$/g, "")
    .toLowerCase();
  if (!email) fail(`EMAIL_TEST is empty in ${file}`);
  return email;
}

async function main() {
  const args = process.argv.slice(2);
  const port = args[args.indexOf("--port") + 1] ?? "";
  if (!args.includes("--port") || !/^\d{2,5}$/.test(port))
    fail("usage: bun scripts/qa-session.ts --port <qa port> [--demo]");
  const demo = args.includes("--demo");

  const url = process.env.DATABASE_URL || containerUrl(port);
  if (!isLocalQaDatabase(url, port))
    fail(`refused: DATABASE_URL is not this machine's qa_${port} database`);
  process.env.DATABASE_URL = url;

  const origin = `http://localhost:${port}`;
  const database = db();
  const base = authOptions({
    secret: QA_SECRET,
    baseURL: origin,
    database: drizzleAdapter(database, { provider: "pg", schema: AUTH_SCHEMA }),
    enrolments: drizzleEnrolmentStore(database),
    rateLimit: false,
  });
  // A separate instance: the test helpers exist only in this process.
  const auth = betterAuth({ ...base, plugins: [...base.plugins, testUtils()] });
  const ctx = await auth.$context;

  const email = testEmail();
  const found = await ctx.internalAdapter.findUserByEmail(email);
  const user =
    found?.user ??
    (await ctx.internalAdapter.createUser(
      { email, name: "QA", emailVerified: true },
      // Like `kit-deploy user create`: an account made by the operator, not a sign-up.
      { method: "admin" },
    ));
  const { cookies } = await ctx.test.login({ userId: user.id });

  const state = {
    cookies: cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires ?? -1,
      httpOnly: c.httpOnly ?? true,
      secure: c.secure ?? true,
      sameSite: c.sameSite ?? "Lax",
    })),
    origins: [],
  };
  mkdirSync(".qa", { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  console.log(`session for the QA account written to ${OUT} (${origin})`);

  if (demo) {
    const rows = await database
      .insert(projects)
      .values(DEMO_PROJECTS.map((p) => ({ ...p })))
      .onConflictDoNothing()
      .returning({ name: projects.name });
    console.log(
      `demo projects: ${rows.length} added, ${DEMO_PROJECTS.length - rows.length} already there`,
    );
  }
  await database.$client.end();
}

if (import.meta.main) await main();
