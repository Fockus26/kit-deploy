# D017 · Infra · Previews 384 MB each, at most 4 running; the oldest sleeps and wakes on its next push · Confirmed (2026-11-11)

**Decision:** a fifth preview stops the least recently pushed one; a stopped preview's host serves a
"preview dormido" page from Caddy (with its PR and how to wake it). Production sites 256–512 MB each.
**Why:** the brief's memory budget on 8 GB shared with Postgres and unrelated containers.
**Measured (phase 01, 2026-11-11, after server-ready.sh):** 1086 MB used of 7941, 6855 available, swap 4 GB
unused. Postgres 429 MB, evolution_api 227, evolution_postgres 54, gaby 23, evolution_redis 12, dockerd +
containerd 171, Caddy 41, PgBouncer 20. Budget 4 × 384 (previews) + ~5 × 512 (production) + ~300 (dashboard)
≈ 4.4 GB on top of the base: ~2.4 GB margin plus swap. Re-measure when production passes 5 sites.
