# D043 · Panel · One heading rule, one agent-down notice, 404/500 inside the shell · Implemented (2026-11-17)

**Decision:** The project's name is the page's only h1 (`p/[project]/layout.tsx`); the sub-pages
(Variables, Dominios, Previews) title themselves with an h2, and the sections under a title are h2
or h3 as they were. `EmptyState` takes `level` (2 | 3 | 4, default 2): one below the heading of the
section it sits in (3 almost everywhere; 4 under "Passkeys" in Ajustes). There is one service-error
notice, `components/kit/agent-down-notice.tsx` (title, optional `retryHref` for pages whose state is
in the URL: Logs, Bases); `components/panel/agent-down.tsx` is gone. The 404 (`app/not-found.tsx`
for an address no route matches and for proxy.ts's rewrite of an unknown `/p/<name>`;
`app/(panel)/not-found.tsx` for a `notFound()` under the panel) and the 500 (`app/(panel)/error.tsx`)
use `StatusScreen`: the title is an h1 drawn at the h2 size of HANDOFF §5b, because on those screens
it is the only heading. The 500's mono line is Next's `error.digest` ("Petición <id>", "500" when
there is none). `app/global-error.tsx` is the minimal fallback with the same tokens. The root
not-found shows the shell only when the session is real, else the bare card (it never redirects).
**Why:** a screen reader's heading list had two h1 on a project page, and three copies of the
agent-down text had drifted. The digest is the only id that matches a 500 to the server log.
**Discarded alternative:** h2 for the 404/500 title as the handoff literally says (leaves those
pages with no h1); a `not-found.tsx` only in the panel group (an unmatched address never reaches it).
