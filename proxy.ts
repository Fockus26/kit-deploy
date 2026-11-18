/**
 * Optimistic gate (Next 16 Proxy): a visitor without a session cookie never sees a dashboard
 * page, only /login (carrying where they were going) and /enrol. It reads the cookie, never the
 * database: the real check is `dashboardUser()` in each page and route handler.
 * `/api/*` answers for itself (401/404), so it is not matched here.
 *
 * Only page loads are redirected. A POST (a Server Action) goes through untouched: the action
 * checks the session itself and answers a typed 401 result, never a redirect (phase 05 W6).
 */
import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/cookie";
import { isPublicPath, loginPathFor } from "@/lib/auth/next-path";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (
    (request.method !== "GET" && request.method !== "HEAD") ||
    isPublicPath(pathname) ||
    request.cookies.has(SESSION_COOKIE)
  ) {
    return NextResponse.next();
  }
  return NextResponse.redirect(
    new URL(loginPathFor(pathname, search), request.url),
  );
}

export const config = {
  matcher: ["/((?!api/|_next/|favicon.ico$).*)"],
};
