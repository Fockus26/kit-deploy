# Phase 02 — One site by hand (2026-11-11 → 2026-11-13)

Units, each its own PR, merged by the agent after green CI (César's authorization):
#5 lib/core · #6 kit-agent · #7 CLI base · #8 deploy API + schema · #9 templates · #10 switch ·
#11 CLI deploy/rollback/regenerate · #12 install/update (D019) · #13 project/token (D020) · #14 decisions.

## What was verified, and how

- Every unit: unit tests (218 at the end), typecheck, lint, build; Linux runs in Docker for the
  agent and CLI (unix socket, compiled binaries); Postgres 17 in Docker for the stores and the lock.
- install/update: `infra/test/install.test.sh`, 43/43 (Ubuntu + the kit's bootstrap --test).
- security-review on agent (#6), deploy API (#8), switch (#10), install (#12). High finding in #12:
  `--network host` exposed Caddy's admin API (:2019, no auth) to the web → bridge network.
- VPS (2026-11-13): install over SSH; dashboard https://deploy.fockus.dev (LE cert, 2027-02-10);
  kd-hello deployed by three merges; load test 8436/8436; rollback 15.8 s (cutover ~5 s + 10 s
  drain) 0/1358 failed; web stopped → site 20/20; reboot → everything back by itself, gaby healthy;
  certbot renew --dry-run for db.fockus.dev OK.

## Found on the way

- `umask 077` in install.sh leaked into update.sh → /run/kit-deploy 0700 (caught by the Docker test).
- PgBouncer pools by transaction: session advisory locks break → `pg_advisory_xact_lock`; migrations
  go by `kit-db url --direct` (127.0.0.1:5432 on the VPS).
- postgres.js 4 verifies TLS for `sslmode=no-verify`: only the kit's --test URL uses it.
- Windows curl (schannel) hangs on the revocation check for new LE certs: `--ssl-no-revoke` locally.
- The first load run lost 8 requests in one 4 s window, 186 s after the switch, with no request
  reaching Caddy: the VPS resolver; repeated with `--resolve`: 0 failures.
- SSH sessions to the VPS get reset after a few minutes: long remote steps run detached.

## Not done

- Commit status on GitHub after the switch (needs a GitHub token on the platform).
