# D036 · Panel · `/p/<desconocido>` answers a real 404 from `proxy.ts`, not from the layout · Implemented (2026-11-17)

**Decision:** with a session cookie, `proxy.ts` looks the project up (`lib/panel/project-gate.ts`: a name
that is not `^[a-z0-9][a-z0-9_]{0,39}$` is missing without touching the database; otherwise one
`select` on `projects.name`) and rewrites a missing one to a path no route matches, with status 404.
A database that does not answer **fails open**: the page renders and its own `notFound()` (kept in
`p/[project]/layout.tsx` and the pages) is the fallback. Server Actions (POST) and `/api/*` are not touched.
**Why:** the brief asked for the check "in the layout, outside Suspense", but the panel layout itself wraps
the session check in `<Suspense>` (cacheComponents needs it), so by the time any `p/[project]` code runs the
200 is already sent; Next's own docs (streaming › "The HTTP contract") say a request-time 404 under Cache
Components can only come from Proxy.
**Known trade-off:** the proxy only sees that a cookie exists, so a forged cookie can tell an existing
project name (200, then a redirect to /login from the page) from a missing one (404). Names are not secret
(they are subdomains), and no data comes with the 200.
**Discarded alternative:** `notFound()` in the layout (it stays 200 + `noindex`, today's behaviour); a
`loading`-less layout without Suspense (breaks the build under cacheComponents); validating the session in
the proxy (it would duplicate Better Auth's check and open the database for every request).
