# D026 · Data · `metric_samples`: one row per (scope, subject, resolution, bucket); request minutes written once · Confirmed (2026-11-17)

**Decision:** three scopes — `vps` (subject `vps`), `container` (subject = the container's name) and `requests`
(subject `<project>/<env>`, env `production` or `pr-<n>`, every host of it added) — at `1m` and `1h`. A reading
merges into its minute as an average over `samples`; a request minute is written only if that minute has no
requests stored, so a replayed sample never counts twice. The 1 h rows are recomputed (not added) from the
1-minute rows on every collect, from the last hour rolled; never an hour whose minutes are partly pruned. Rows
name the project (text), with no foreign key: they are pruned in 30 days anyway. CPU is stored as Docker gives it
(100 per core); the denominator is the VPS's CPUs (`cpus` on the vps row), since no container has `--cpus`.
**Why:** the unique slot makes every write an idempotent upsert; the merging and rollups are pure TypeScript
(`lib/metrics/collect.ts`), tested with a fake clock — the repo has no Postgres in unit tests.
**Discarded alternative:** a table per kind (vps, container, requests): three schemas and three rollups for the same
four operations; a `project_id` foreign key: a cascade over up to 30 days of rows on every project removal.
