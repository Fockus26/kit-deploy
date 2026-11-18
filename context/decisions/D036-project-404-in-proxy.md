# D036 · Panel · `/p/<desconocido>` answers a real 404 from `proxy.ts`, not from the layout · Implemented (2026-11-17)

**Decision:** for `/p/...` only, `proxy.ts` first checks the session for real (`requestUser(request.headers)`, the same Better Auth check as the panel); anything that is not a valid dashboard session, or a check that throws, gets the same login redirect as no cookie (never a 404). Only then it looks the project up (`lib/panel/project-gate.ts`: a name
that is not `^[a-z0-9][a-z0-9_]{0,39}$` is missing without touching the database; otherwise one
`select` on `projects.name`) and rewrites a missing one to a path no route matches, with status 404.
A database that does not answer **fails open**: the page renders and its own `notFound()` (kept in
`p/[project]/layout.tsx` and the pages) is the fallback. Server Actions (POST) and `/api/*` are not touched.
**Why:** the brief asked for the check "in the layout, outside Suspense", but the panel layout itself wraps
the session check in `<Suspense>` (cacheComponents needs it), so by the time any `p/[project]` code runs the
200 is already sent; Next's own docs (streaming › "The HTTP contract") say a request-time 404 under Cache
Components can only come from Proxy.
**Why the order:** a forged cookie must neither enumerate project names (404 vs redirect) nor make the proxy query Postgres per request. Other paths keep the cookie-only check (no database).
**Discarded alternative:** `notFound()` in the layout (it stays 200 + `noindex`, today's behaviour); a
`loading`-less layout without Suspense (breaks the build under cacheComponents); looking the project up on the cookie alone (it leaked existence and let a fake cookie hit the database).
