# D035 · Data · db.status parses kit-db list/status for the project's two databases; no connections column in v1 · Implemented (2026-11-17)

**Decision:** kit-agent's `db.status { project }` runs `kit-db list` and `kit-db status` (argv, 30 s
timeout) and returns only `<project>` (production) and `<project>_preview` (preview):
`{ databases: [{ name, env, sizeBytes | null, sizeText, lastBackup: { file, at | null } | null }],
offVps: string | null, failures: string[] }`. A database exists when `kit-db list` prints it; `sizeBytes`
comes from pg_size_pretty's text (powers of 1024, so rounded to its unit); `at` from the dump's name
`<db>-YYYYmmdd-HHMMSS.dump`, read as UTC (the VPS's clock; a name not in that format gives `at: null`).
`failures` keeps only the `FAIL <date> <db>: …` lines whose third field is exactly one of the two names,
with URLs scrubbed, control characters removed and each line bounded. `offVps` is the rclone remote when it
is a named one (`r2:kit-backups`); an on-the-fly remote (`:s3,key=…:bucket`) can hold credentials in the
string, so it comes back as `(configured)` and is replaced the same way inside failure lines. A name ending
in `_preview` is refused (it is another project's previews database). The Bases page shows name,
environment, size and last backup; **it has no connections column in v1**.
**Why:** kit-db already is the one place that knows the databases and their backups (kit reference, not
ours to change); both commands print every database on the central Postgres, so the filter lives in the
root agent, which never lets another database's name, size or failure out. kit-db has no command for
connections, and adding one means changing the kit's script or giving the agent its own `psql`.
**Discarded alternative:** connections per database from `pg_stat_activity` through `su postgres -c psql`
in the agent (a second way into Postgres from the root daemon, outside kit-db, with its own SQL to
validate); or adding `kit-db connections` to the kit (a kit change for a v1 column nobody asked to act
on). Either can come later as a `db.status` field without changing the rest.
