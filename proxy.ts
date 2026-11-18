/**
 * Optimistic gate (Next 16 Proxy): a visitor without a session cookie never sees a dashboard
 * page, only /login (carrying where they were going) and /enrol. It reads the cookie, never the
 * database: the real check is `dashboardUser()` in each page and route handler.
 * `/api/*` answers for itself (401/404), so it is not matched here.
 *
 * With a valid session, `/p/<unknown>` answers a real 404 here: inside the page `notFound()` comes after
 * the streamed 200 (Cache Components), so this is the only place that can set the status.
 *
 * Only page loads are redirected. A POST (a Server Action) goes through untouched: the action
 * checks the session itself and answers a typed 401 result, never a redirect (phase 05 W6).
 */
import { type NextRequest, NextResponse } from "next/server";
import { requestUser } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/auth/cookie";
import { isPublicPath, loginPathFor } from "@/lib/auth/next-path";
import { projectMissing, projectOfPath } from "@/lib/panel/project-gate";

/** A path no route matches: Next renders its not-found page, with the 404 set here. */
const MISSING_PATH = "/_proyecto-no-existe";

export type ProxyDeps = {
  /** A real dashboard session (Better Auth), not just a cookie; throws are "no session". */
  validSession(request: NextRequest): Promise<boolean>;
  missing(pathname: string): Promise<boolean>;
};

const realDeps: ProxyDeps = {
  validSession: async (request) =>
    (await requestUser(request.headers)) !== null,
  missing: projectMissing,
};

const toLogin = (request: NextRequest) =>
  NextResponse.redirect(
    new URL(
      loginPathFor(request.nextUrl.pathname, request.nextUrl.search),
      request.url,
    ),
  );

/**
 * `/p/...` runs the project lookup only for a REAL session: a forged cookie gets the same login
 * redirect whether the project exists or not, and never makes the proxy query the project table.
 * Other paths keep the cookie-only check.
 */
export async function handleProxy(request: NextRequest, deps: ProxyDeps) {
  const { pathname } = request.nextUrl;
  const page = request.method === "GET" || request.method === "HEAD";
  if (!page || isPublicPath(pathname)) return NextResponse.next();
  if (!request.cookies.has(SESSION_COOKIE)) return toLogin(request);
  if (projectOfPath(pathname) === null) return NextResponse.next();
  let valid = false;
  try {
    valid = await deps.validSession(request);
  } catch {
    valid = false;
  }
  if (!valid) return toLogin(request);
  return (await deps.missing(pathname))
    ? NextResponse.rewrite(new URL(MISSING_PATH, request.url), { status: 404 })
    : NextResponse.next();
}

export function proxy(request: NextRequest) {
  return handleProxy(request, realDeps);
}

export const config = {
  matcher: ["/((?!api/|_next/|favicon.ico$).*)"],
};
