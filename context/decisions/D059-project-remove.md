# D059 · Agent · `project rm` (root): rows first, then kit-agent's `project.remove` (Caddy → containers → images → pin) · Implemented

**Decision:** `kit-deploy project rm <project> [--yes]`, root over ssh like `project pin`. Without
`--yes` it lists what it would remove and exits 0; with it:
1. **Rows**, in one transaction: the `projects` row (its deployments, domains, variables, deploy
   tokens and cron jobs go by `on delete cascade`), its open alerts closed with no email
   (`resolved_notified_at` set), its alert checks' streaks deleted, and one `project.remove` audit
   row (name: the repo). Done first so no deploy (its tokens are gone), cron call, domain check,
   `regenerate` or alert acts on the project while the machine is being cleaned.
2. **kit-agent `project.remove`** (`agent/project-remove.ts`, serial with every other mutation):
   the Caddy files first — `/etc/caddy/sites/<p>.caddy` and `/etc/caddy/previews/<p>-pr-<n>.caddy`,
   each only if its first line is kit-deploy's header for that name — in **one** validate + reload
   that puts every file back on failure (then nothing else is touched); then the containers Docker
   labels as kit-deploy's for that project (stop, `docker rm` without `-f`); then the tags of the
   repository in the root-owned pin that no container uses (`docker image rm` without `-f`; none
   if another project pins the same repository); the pin file last, and only when nothing failed,
   so a second run still finds what is left.
Idempotent: a second run says "already gone" and exits 0; a run that finds only machine leftovers
(no rows) still writes its audit row. A failed step is listed, exits 1 and says to run it again.
Audit action `project.remove` appended (migration 0015, the check constraint only). No dashboard
copy: the Auditoría table prints the action as code (no CONTENT_CHECKLIST row 43).
**Why:** César wants kd_hello gone (2026-11-18) the platform's way, not by hand on the VPS.
"What kit-deploy created" is read from kit-deploy's own records that the web app cannot forge for
another project: Docker's labels, the file names and headers kit-agent writes, and the root pin
(the database is the web app's to write, D051). Caddy goes before the containers so no host is
ever proxied to a container that is gone.
**Discarded alternative:** the machine first and the rows after (a failure in between leaves live
`deployments` rows that `domain check` and `regenerate` would write back into Caddy, pointing at a
dead port, and a `site_down` alert); a `--force` docker rm (would also remove a container Docker
says is busy); deleting the alerts and audit rows (they are history and outlive the project, like
the audit log already does); a step in `infra/test/install-in-container.sh` (it tests install and
update, not deployed projects; this unit has no Docker to run it — the orchestrator's
`test:infra:install` run is unchanged).
