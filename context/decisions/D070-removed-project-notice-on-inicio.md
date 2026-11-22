# D070 · Panel · After Eliminar proyecto the panel lands on Inicio with `?eliminado=<p>`; half done → the CLI command · Implemented

**Decision:** a removal that went through (or half went) redirects to `/?eliminado=<p>`, plus
`&estado=pendiente` when kit-agent stopped answering or a step failed after the rows went, or
`&estado=ya` when nothing was left (a second submit). Inicio words it in a Notice that takes focus
(`components/panel/removed-project-notice.tsx`, `lib/panel/removed-notice.ts`): done → what went and
that the databases and the audit log stay; pending (warning) → the rows are gone and
`kit-deploy project rm <p> --yes` (with a copy button) finishes the machine side. Shown only for a
valid project name that is not in the list, so a crafted link cannot claim a live project was
removed. Cerrar drops the query. The agent's failed steps go to the panel's log, not the URL.
**Why:** the project's own pages 404 once its rows are gone, so the dialog cannot stay to show the
result, and there is no panel page left to "Eliminar" again from: the CLI already lists exactly
what is left and retries it (D059).
**Discarded alternative:** keeping the dialog open on a partial result (the layout's revalidation
404s under it); the failed lines in the query string (long, the agent's English); a flash cookie
(new mechanism for one notice).
