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
import { cache } from "react";
import { requestUser } from "@/lib/auth";
import { LOGIN_PATH } from "@/lib/auth/next-path";
import type { DashboardUser } from "@/lib/auth/session";

/** The signed-in dashboard user of this request, or null. A Server Action calls this, never
 * `panelUser()`: without a session it answers a typed 401 result, not a redirect. */
export const sessionUser = cache(
  async (): Promise<DashboardUser | null> => requestUser(await headers()),
);

export const panelUser = cache(async (): Promise<DashboardUser> => {
  const user = await sessionUser();
  if (!user) redirect(LOGIN_PATH);
  return user;
});
