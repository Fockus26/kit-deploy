# fix/caddy-upstream-keepalive — PR #72 (2026-11-18)

Origin: César asked what from "I Asked Expert Programmers to Max Out a $12 Server" fits real projects.
Proposed 4 units; César picked keep-alive first. The others wait: k6 load test (p95 < 500 ms, p99 < 1 s,
errors < 1 %), per-project `--cpus`, Caddy `encode zstd gzip` + `compress: false` in projects.
Rejected: io_uring, own HTTP server, bypassing Caddy, SQLite, Bun as runtime.

- Caddy's default upstream keepalive is 2 min; Next standalone (no KEEP_ALIVE_TIMEOUT) closes at Node's 5 s
  → Caddy reuses a closed socket → 502 on non-idempotent requests (Caddy docs).
- Fix: `UPSTREAM_KEEPALIVE = "4s"` (lib/core/constants.ts) in renderSite, a `kit_upstream` snippet in
  kit-previews.caddy (exchange, forward_auth, app) and update.sh's dashboard printf; a test keeps the 3 in sync.
- Verified: suite 1006/0, previews Docker 40 ALL PASS, install Docker ALL PASS. 502 itself not reproduced.
- On ship: existing production sites need `kit-deploy regenerate` (starts stopped containers — `list` first).
- Worktree note: Biome ignores `.claude/worktrees` paths; lint checked through stdin.
