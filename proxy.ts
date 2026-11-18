/**
 * Optimistic gate (Next 16 Proxy): a visitor without a session cookie never sees a dashboard
 * page, only /login (carrying where they were going) and /enrol. It reads the cookie, never the
 * database: the real check is `dashboardUser()` in each page and route handler.
 * `/api/*` answers for itself (401/404), so it is not matched here.
 *
 * With a session, `/p/<unknown>` answers a real 404 here: inside the page `notFound()` comes after
 * the streamed 200 (Cache Components), so this is the only place that can set the status.
 *
 * Only page loads are redirected. A POST (a Server Action) goes through untouched: the action
 * checks the session itself and answers a typed 401 result, never a redirect (phase 05 W6).
 */
import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/cookie";
import { isPublicPath, loginPathFor } from "@/lib/auth/next-path";
import { projectMissing } from "@/lib/panel/project-gate";

/** A path no route matches: Next renders its not-found page, with the 404 set here. */
const MISSING_PATH = "/_proyecto-no-existe";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const page = request.method === "GET" || request.method === "HEAD";
  if (!page || isPublicPath(pathname)) return NextResponse.next();
  if (request.cookies.has(SESSION_COOKIE)) {
    return (await projectMissing(pathname))
      ? NextResponse.rewrite(new URL(MISSING_PATH, request.url), {
          status: 404,
        })
      : NextResponse.next();
  }
  return NextResponse.redirect(
    new URL(loginPathFor(pathname, search), request.url),
  );
}

export const config = {
  matcher: ["/((?!api/|_next/|favicon.ico$).*)"],
};
