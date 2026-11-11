# Phase 01 — Server ready

## Goal

The VPS can run containers behind Caddy with HTTPS, without breaking the central Postgres.

## Scope

- `infra/server-ready.sh`: idempotent, `--test` mode in a Docker container (like the kit's
  `bootstrap.sh --test`), safe to re-run.
- **First** (brief, Traps): `db.fockus.dev`'s certificate from certbot standalone to **webroot**
  (`/var/www/acme`), Caddy serving `http://db.fockus.dev/.well-known/acme-challenge/`; `certbot
  certonly --webroot … --cert-name db.fockus.dev -n`; the PgBouncer deploy hook kept.
- Docker Engine + `/etc/docker/daemon.json` (`log-opts` max-size 10m, max-file 3).
- Caddy built with `caddy-dns/cloudflare` (xcaddy), `Caddyfile` importing `/etc/caddy/sites/*.caddy`,
  JSON access log; token file `/etc/caddy/cloudflare.env` (César writes it, CONTENT_CHECKLIST #1).
- ufw: 80/443 open (22 and 6432 stay). Swap file 4 GB. Postgres unit `OOMScoreAdjust=-900`.
- `kit-db create kit_deploy` (+ `kit_deploy_dev` for local development if useful).
- `/etc/kit-deploy/` (root, 0700) and the master key generated (César copies it, CONTENT_CHECKLIST #4).

## Units of work

1. `infra/server-ready.sh` + its Docker test (`bun run test` runs it in CI when Docker is available).
2. Running it on the VPS (César's OK) and the measurements: `docker stats`, `free -m`, the RAM of the
   unrelated containers → `PHASE_LOG/01-server-ready.md`.

## Closes when

- [ ] `certbot renew --dry-run` passes **with Caddy running**.
- [ ] `nmap` from outside sees only 22, 80, 443, 6432.
- [ ] A reboot brings Postgres, PgBouncer and Caddy back by themselves.
- [ ] Base RAM measured and the memory budget confirmed or corrected (decision).
