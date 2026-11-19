# feat/load-test — PR #76 (2026-11-19)

Unit 2 of the «$12 server» review (César picked it after #72).
- `bun run load-test -- <url>`: k6 2.3.0 in Docker from the laptop (not the VPS: same CPU as the site).
  constant-arrival-rate; thresholds p95 < 500 ms, p99 < 1 s, http_req_failed < 1 % (`--strict`: == 0),
  dropped_iterations == 0; redirects not followed; `--resolve <ip>` pins the host (phase 02 resolver loss).
- `bun run test:infra:load`: fake node app (counters, not random) → 13 checks ALL PASS.
- Not run against the VPS: needs César's OK (kd-hello, then a `--strict --duration 5m` across a merge
  — closes the brief's "no failed request during the switch").
- Found: main folder node_modules lacks `cmdk` (#71) → typecheck fails in worktrees junctioned to it;
  needs `bun install` in the main folder (another session lives there). Docker Desktop hung once:
  WSL docker-desktop exec error, an «Ubuntu» distro stuck in Installing; relaunching it fixed it.
