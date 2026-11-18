# D014 · Data · Runtime logs to daily files per project (14 days), not Postgres · Confirmed (2026-11-17)

**Decision:** kit-agent follows each container's output into `/var/lib/kit-deploy/logs/<project>/<date>.log`
(gzip the next day, 14 days kept); tail and search are agent operations. Docker's json-file driver capped at
`max-size 10m`, `max-file 3`.
**Why:** logs in the central Postgres would load the database every project uses; files are inspectable over SSH.
**Discarded alternative:** Loki/Vector (another service and its RAM); a Postgres table with retention.
**Implemented (2026-11-17, phase 05):** `agent/logs.ts` — lines as JSON `{ts, container, env, stream, line}`, 16 Ki
characters per line, URLs of databases scrubbed; ops `logs.tail` / `logs.search`; CLI `kit-deploy logs`. The
daemon.json limits were already in `infra/server-ready.sh`. How containers are followed: D024; the daily cap: D025.
