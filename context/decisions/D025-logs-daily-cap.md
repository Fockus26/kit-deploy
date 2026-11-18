# D025 · Data · At most 50 MiB of logs per project and day; past it the day's lines are dropped · Confirmed (2026-11-17)

**Decision:** the follower stops writing a project's `<day>.log` once it reaches 50 MiB, after one line saying so
(`logs.day_capped` in the agent's journal); the next day starts again. `logs.tail` reads at most the last 4 MiB
of today's file; every `logs.tail` / `logs.search` answer is bounded to 512 KiB, newest lines kept.
**Why:** D014 caps Docker's own files (10m × 3) but not ours: a container in a crash loop or logging every request
could fill the VPS disk in 14 days, and the disk is shared with the central Postgres.
**Discarded alternative:** no cap (disk risk); dropping the oldest lines of the day (a rewrite of the file per
append); a cap per container (a project's previews would each get their own budget).
