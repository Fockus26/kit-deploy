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

## First run against kd-hello (2026-11-19, laptop, César's OK)
- Laptop ↔ VPS RTT ~200 ms. 50 req/s·60 s: 658 done (9/s real), 2343 dropped, client med 7.3 s; Caddy side
  med 161 ms p95 4.4 s. 10 req/s·30 s: client med 415 / p95 657 ms, 0 errors; Caddy med 24 / p95 263 ms.
- On the VPS: app direct ~35 ms, via Caddy with new TLS 140–290 ms; load 0.7, 5.7 GB free.
- Laptop numbers are network-bound (RTT + Docker Desktop NAT). Real figures need k6 on the VPS
  (`--network host --resolve 127.0.0.1`) or a nearby machine — César's call. Posted on #76.
