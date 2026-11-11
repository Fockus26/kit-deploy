# Current Phase — kit-deploy

> A board, not a diary: ≤ 60 lines / 4 KB. Narrative → `PHASE_LOG/<branch>.md`.
> Local file: backed up with `bun run context:backup` (branch `context-state`).

## Now

**Phase:** 01 — Server ready · **Track:** own, infrastructure first (D018)
Kickoff closed 2026-11-10 (plan approved by César). Nothing touched on the VPS yet.

| Unit | Branch | Status | Log |
|---|---|---|---|
| server-ready script + Docker test | `infra/server-ready` | next | — |

## Blocked (actions for César or external)

- CONTENT_CHECKLIST #1: Cloudflare token (DNS edit, zone fockus.dev) — needed before Caddy's wildcard (phase 03), not for 01's base install.
- CONTENT_CHECKLIST #2: DNS-only record `deploy.fockus.dev` and `hello.fockus.dev` before phase 02.

## Next

- Phase 01, unit 1: `infra/server-ready.sh` (certbot → webroot first, Docker + log limits, Caddy with
  `caddy-dns/cloudflare`, ufw 80/443, swap, `OOMScoreAdjust`), tested with `--test` in Docker;
  then César's OK to run it on the VPS. See `phases/01-SERVER-READY.md`.

## Phases

| # | Phase | Status |
|---|---|---|
| 01 | Server ready | next |
| 02 | One site by hand | pending |
| 03 | Previews | pending |
| 04 | Variables and databases | pending |
| 05 | Dashboard (kit UI phases in `phases/ui/`) | pending · brief in `design/BRIEF-kit-deploy.md` |
| 06 | Alerts and cron | pending |
| 07 | First real project: maranatha | pending |
| 08 | Back into the kit | pending |
| 09 | Final QA ("Done when") | pending |
