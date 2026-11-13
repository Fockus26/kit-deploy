# Current Phase — kit-deploy

> A board, not a diary: ≤ 60 lines / 4 KB. Narrative → `PHASE_LOG/<branch>.md`.
> Local file: backed up with `bun run context:backup` (branch `context-state`).

## Now

**Phase:** 02 — One site by hand · **Track:** own, infrastructure first (D018)
kit-deploy installed on the VPS 2026-11-13 (César's OK); kd-hello live at https://kd-hello.fockus.dev.

| Unit | PR | Status |
|---|---|---|
| lib/core (Caddy, docker args, ports) | #5 | merged |
| kit-agent daemon | #6 | merged |
| CLI version/list/status | #7 | merged |
| POST /api/v1/deploy + Drizzle schema | #8 | merged |
| templates (Dockerfile, deploy-vps.yml) | #9 | merged |
| switch, rollback, regenerate + domains | #10 | merged |
| CLI deploy/rollback/regenerate | #11 | merged |
| release over SSH, install.sh, update.sh (D019) | #12 | merged · installed on the VPS |
| project add / domain add / token create (D020) | #13 | merged |
| decisions D019, D020 | #14 | open → merge |

Log: `PHASE_LOG/02-one-site-by-hand.md`.

## Closes when (phase 02)

- [x] A merge on kd-hello deploys production · [ ] **the commit gets its status** (not built: needs a GitHub token with commit-status on the platform — next unit)
- [x] Load test during a deploy: 8436/8436 OK (DNS-free run; first run's 8 failures were the load generator's resolver)
- [x] `kit-deploy rollback kd_hello` 15.8 s, no build, 0/1358 failed under load
- [x] Reboot brings it back; with kit-deploy-web stopped the site answers 20/20
- [x] `ssh kit-vps kit-deploy version` → 0.1.0 / 0.1.0
- [x] RAM of one site: kd-hello 41 MB idle, 48 MB under load (limit 256); web 34 MB; agent 45 MB; VPS 1060/7941 MB

## Blocked (actions for César or external)

- QA pendiente: once at the end (phase 09), per César 2026-11-10.
- CONTENT_CHECKLIST #1: Cloudflare token (phase 03, wildcard for previews) and `*.preview.fockus.dev` record.

## Next

- Unit: commit status on GitHub after the switch (closes phase 02).
- Closed code to fix in its own unit: `infra/server-ready.sh` resets /etc/kit-deploy to 0700 (update.sh heals it).
- Bump the templates' actions off Node 20 (phase 08, when they move into the kit).

## Phases

| # | Phase | Status |
|---|---|---|
| 01 | Server ready | done 2026-11-11 (nmap: PR #4 merged, run pending) |
| 02 | One site by hand | all but the commit status (2026-11-13) |
| 03 | Previews | next |
| 04 | Variables and databases | pending |
| 05 | Dashboard (kit UI phases in `phases/ui/`) | pending · brief in `design/BRIEF-kit-deploy.md` |
| 06 | Alerts and cron | pending |
| 07 | First real project: maranatha | pending |
| 08 | Back into the kit | pending |
| 09 | Final QA ("Done when") | pending |
