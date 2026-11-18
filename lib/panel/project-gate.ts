/**
 * "Is /p/<name> a project?", asked by the proxy before anything renders: with Cache Components a
 * `notFound()` inside the panel's Suspense comes after the 200 is sent, so only the proxy can
 * answer a real 404 (Next docs › streaming › "The HTTP contract"). Fails open: a database that
 * does not answer lets the page through, and the page's own `notFound()` is the fallback.
 */
import { eq } from "drizzle-orm";
import { projects } from "@/lib/db/schema";
import { db } from "@/lib/db/store";

/** The `projects_name_format` check (lib/db/schema.ts). */
const PROJECT_NAME = /^[a-z0-9][a-z0-9_]{0,39}$/;
const PROJECT_PATH = /^\/p\/([^/]+)(?:\/|$)/;

/** The project a `/p/...` path names, or null when it is not a project path. */
export function projectOfPath(pathname: string): string | null {
  const m = PROJECT_PATH.exec(pathname);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

export async function projectMissing(
  pathname: string,
  exists: (name: string) => Promise<boolean> = projectExists,
): Promise<boolean> {
  const name = projectOfPath(pathname);
  if (name === null) return false;
  if (!PROJECT_NAME.test(name)) return true;
  try {
    return !(await exists(name));
  } catch {
    return false;
  }
}

async function projectExists(name: string): Promise<boolean> {
  const rows = await db()
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.name, name))
    .limit(1);
  return rows.length > 0;
}
