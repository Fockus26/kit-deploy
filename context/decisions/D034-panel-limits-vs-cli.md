# D034 · Data · From the panel: redeploy runs after the response, no image pin, audit stays variables-only, no alerts until phase 06 · Implemented (2026-11-17)

**Decision:** Redeploy answers once the deployment is queued and runs the switch in Next's `after()`,
like `/api/v1/deploy`; Rollback, Reiniciar and Parar run inline and return their result (a rollback
waits at most the 60 s health check). A project created from the panel gets its row, its domains and
a deploy token, but **not** its image pin: the pin is root's (`/etc/kit-deploy`, `project pin` checks
the repository typed by César, never the one in the database the web app can write), so the result
carries `ssh kit-vps kit-deploy project pin <project> <repo>` and its containers get no variables
until it runs. `audit_log` keeps only `env.set` / `env.remove` (its check constraint): no migration
0011 for the other panel actions. Inicio's "Alertas abiertas" is always empty (`alerts: []`) until
phase 06 brings alerts. The deployments and previews tables have no commit message, author or PR title:
they are not stored (`message`, `author`, `title` are `null` in the read types).
**Why:** the switch can take minutes (pull, health); the panel is never what a site depends on, and
`after()` is the pattern the deploy API already uses. The pin rule is the phase 04 security review's
(the web container is not root and must not be able to choose which images receive secrets). Auditing
every action is a schema change with its own unit; the brief's audit (F4) is about variables.
**Discarded alternative:** a pin written by kit-agent on the web app's request (a new root operation
that would let the web app decide which repository gets the variables — exactly what the pin prevents);
auditing all panel actions now with migration 0011 (larger than this unit, and the Auditoría page can
show the extra actions once they exist).
