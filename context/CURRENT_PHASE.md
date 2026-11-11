# Current Phase — kit-deploy

> A board, not a diary: ≤ 60 lines / 4 KB. Narrative → `PHASE_LOG/<branch>.md`.
> Local file: backed up with `bun run context:backup` (branch `context-state`).

## Now

**Phase:** 01 — Server ready · **Track:** own, infrastructure first (D018)
server-ready.sh ran on the VPS 2026-11-11 (César's OK).

| Unit | Branch | Status | Log |
|---|---|---|---|
| 1 · server-ready script + Docker test | `feat/infra-server-ready` | merged (PR Fockus26/kit-deploy#1, 42653fd; test Docker 37/37) | `PHASE_LOG/feat-infra-server-ready.md` |
| 2 · run on the VPS + measurements | PR #2 fix + #3 D017 | done 2026-11-11 (cert webroot, Caddy up, RAM measured) | `PHASE_LOG/feat-infra-server-ready.md` |

## Blocked (actions for César or external)

- QA pendiente: César pidió (2026-11-10) el QA una sola vez al final, no por unidad (fase 09).

- CONTENT_CHECKLIST #1: Cloudflare token (DNS edit, zone fockus.dev) — needed before Caddy's wildcard (phase 03), not for 01's base install.
- CONTENT_CHECKLIST #2: DNS-only record `deploy.fockus.dev` and `hello.fockus.dev` before phase 02.

## Next

- Close phase 01: reboot test (César's OK: brief outage of every site) and nmap from a clean network (the laptop's network fakes every port as open). Then phase 02.
  `caddy-dns/cloudflare`, ufw 80/443, swap, `OOMScoreAdjust`), tested with `--test` in Docker;

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
