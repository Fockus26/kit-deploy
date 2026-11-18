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

export const panelUser = cache(async (): Promise<DashboardUser> => {
  const user = await requestUser(await headers());
  if (!user) redirect(LOGIN_PATH);
  return user;
});
