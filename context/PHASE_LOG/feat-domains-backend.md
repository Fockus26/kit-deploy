# feat/domains-backend (W4, phase 05 wave 1) — 2026-11-17

- `domains`: redirect, status, dns_checked_at, dns_ok_at, cert_not_after, last_error (migration 0009_domain_status for now → renumber to 0010 after W3's metrics; keep the hand-written UPDATE at its end).
- A host enters its Caddy site once `domain check` sees its DNS point to the VPS (D028); default host always. Redirect www ↔ apex as a 308 block in the same site file (`site.write.redirects`).
- `cert.status` reads Caddy's storage (D029). `domain add --redirect | ls | rm | redirect | check`; `kit-deploy-domain-check.{service,timer}` every minute, installed by update.sh and packed by release.sh.
- DNS lookups on the CLI side: no `dns.resolve` op (the brief listed it as a reserved name).
- Verified: 703 tests, typecheck, lint, build, build:cli, build:agent. Not verified: Docker install test (orchestrator, per phase), the opt-in Postgres test (KIT_DB_TEST_URL), anything on the VPS.
- Branch pushed as feat/domains-backend-r2 (rebased onto W2 before the no-force-push instruction arrived).
