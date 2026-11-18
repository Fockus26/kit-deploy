/**
 * The panel's session check (proxy.ts only looks at the cookie): an enrolment or expired
 * session goes to /login too. Once per request (React `cache`), so the panel layout and every
 * page or query under it can call it.
 *
 * Next renders a layout and its page in parallel: the layout's check does not hold the page
 * back. Anything that reads data calls `panelUser()` itself (lib/panel/projects.ts does).
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { requestUser } from "@/lib/auth";
import { LOGIN_PATH } from "@/lib/auth/next-path";
import type { DashboardUser } from "@/lib/auth/session";

/** The signed-in dashboard user of this request, or null. A Server Action calls this, never
 * `panelUser()`: without a session it answers a typed 401 result, not a redirect. */
export const sessionUser = cache(async (): Promise<DashboardUser | null> => {
  const h = await headers();
  // The expiry check reads the clock: only at request time, never in a prerender (Cache
  // Components logs "unstable value Date.now()" otherwise). Resolves at once in an action.
  await connection();
  return requestUser(h);
});

export const panelUser = cache(async (): Promise<DashboardUser> => {
  const user = await sessionUser();
  if (!user) redirect(LOGIN_PATH);
  return user;
});
