# Phase 02 — One site by hand (2026-11-11 → 2026-11-13)

Units, each its own PR, merged by the agent after green CI (César's authorization):
#5 lib/core · #6 kit-agent · #7 CLI base · #8 deploy API + schema · #9 templates · #10 switch ·
#11 CLI deploy/rollback/regenerate · #12 install/update (D019) · #13 project/token (D020) · #14 decisions ·
#15 commit status (merged by César).

## What was verified, and how

- Every unit: unit tests (218 at the end), typecheck, lint, build; Linux runs in Docker for the
  agent and CLI (unix socket, compiled binaries); Postgres 17 in Docker for the stores and the lock.
- install/update: `infra/test/install.test.sh`, 43/43 (Ubuntu + the kit's bootstrap --test); 53/53 with #15.
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
- #15: deploy.fockus.dev resolves for real now, so the install test's "no DNS yet" step uses a
  `.invalid` host. The laptop's network dropped four Docker runs (apt could not resolve) and two
  builds (Google Fonts): retry, one job at a time.
- update.sh's last line prints the previous release twice (`${PREV:+…}${PREV:-none}`): cosmetic.

## Commit status (#15, 2026-11-13)

- After each deploy, `processProject` posts `kit-deploy/production` to GitHub: success "Live at
  <host>" with a link, or failure "Deploy failed: <reason>" (140 chars). Best effort: GitHub down
  never changes the outcome (`switch.status_failed`); without a token, `switch.status_skipped`.
- Token: `/etc/kit-deploy/github.env` root 0600 via `install.sh --github-token` (stdin). Web: second
  `--env-file`. CLI: reads it only as root. security-review: no findings ≥ 8.
- Release aea0ee6d3374 on the VPS (update, César's OK): version 0.1.0/0.1.0, web up, dashboard and
  kd-hello 200, kd-hello untouched.

## Not done

- The token itself: César creates it (fine-grained, Commit statuses only) and runs
  `ship.sh build/kit-deploy-aea0ee6d3374.tgz --install --github-token`. Then a push to kd-hello
  must show the status on its commit.
