# D060 · Data · `project rm` keeps the kit-db databases and their markers; it prints the drop commands · Implemented

**Decision:** `project rm` never runs `kit-db drop`. kit-agent only asks kit-db whether
`<project>` / `<project>_preview` exist (`kit-db url`, its output dropped) and whether kit-deploy
owns them (the root marker, D051); the command then prints, for each one that exists:
`kit-db drop <db> --yes` (plus `&& rm /etc/kit-deploy/dbs/<db>` when the marker is there), to run as
root once its last backup is checked (`kit-deploy db status <project>`). The markers stay with the
databases. Also kept: the master key, the audit log, closed alerts, metric samples (30 days), the
logs (14 days) and Caddy's certificates.
**Why:** CLAUDE.md (no `kit-db drop`) and César for kd_hello (2026-11-18): a database is the one
thing a redeploy cannot bring back, so dropping it stays a separate, typed act. The marker stays
because the database is still kit-deploy's: a project registered again under that name (and pinned
by root) gets it back, and removing the marker without dropping would only turn it into an
"unmanaged" database that needs `db adopt`.
**Discarded alternative:** a `--drop-databases` flag (one typo away from losing data, and against
the rule); removing the markers (orphans the database from `db status` for no gain).
