# feat/agent-db-status (W7, phase 05 wave 2) — 2026-11-17

- Op `db.status { project }` in `agent/databases.ts`: runs `kit-db list` + `kit-db status` (argv, 30 s) and keeps only `<project>` / `<project>_preview` (exact name match). Size from pg_size_pretty (1024-based, rounded), last backup's time from the dump name read as UTC, failures filtered by the exact `<db>:` field, scrubbed. `_preview` names refused.
- `offVps`: named rclone remote as is; an on-the-fly remote (`:s3,key=…`) → `(configured)`, also inside FAIL lines (current and earlier remotes).
- CLI `kit-deploy db status <project> [--json]` in `cli/db-commands.ts`; `db create` left in commands.ts.
- D035: no connections column in v1 (kit-db has no command for it).
- Verified: full suite (761 pass), typecheck, lint, build:agent, build:cli, security review (no findings ≥ 8). Not verified: on the VPS (real kit-db output, the VPS's timezone being UTC).
