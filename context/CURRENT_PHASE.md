# Current Phase — kit-deploy

> A board, not a diary: ≤ 60 lines / 4 KB. Narrative → `PHASE_LOG/<branch>.md`.
> Local file: backed up with `bun run context:backup` (branch `context-state`).

## Now

**Phase:** 03 — Previews (next) · **Track:** own, infrastructure first (D018)
Phase 02 closed 2026-11-13: kd-hello deploys on merge, gets its commit status, rolls back, survives reboot.

| Unit | PR | Status |
|---|---|---|
| core, agent, CLI base, deploy API, templates, switch, CLI deploy | #5–#11 | merged |
| release over SSH, install.sh, update.sh (D019) | #12 | merged · installed on the VPS |
| project add / domain add / token create (D020) | #13 | merged |
| decisions D019, D020 | #14 | merged |
| commit status after the switch | #15 | merged · on the VPS (aea0ee6d3374), verified |

Log: `PHASE_LOG/02-one-site-by-hand.md`.

## Closes when (phase 02)

- [x] A merge on kd-hello deploys production · [x] the commit gets its status (kd-hello d740b30: success "Live at kd-hello.fockus.dev", 7 s after the Action)
- [x] Load test during a deploy: 8436/8436 OK (DNS-free run; first run's 8 failures were the load generator's resolver)
- [x] `kit-deploy rollback kd_hello` 15.8 s, no build, 0/1358 failed under load
- [x] Reboot brings it back; with kit-deploy-web stopped the site answers 20/20
- [x] `ssh kit-vps kit-deploy version` → 0.1.0 / 0.1.0
- [x] RAM of one site: kd-hello 41 MB idle, 48 MB under load (limit 256); web 34 MB; agent 45 MB; VPS 1060/7941 MB

## Blocked (actions for César or external)

- Each new project's repo must be added to the GitHub status token (GitHub → the token → Repository
  access); no reinstall. The token expires: when it does, re-run `ship.sh … --install --github-token`.

- QA pendiente: once at the end (phase 09), per César 2026-11-10.
- CONTENT_CHECKLIST #1: Cloudflare token (phase 03, wildcard for previews) and `*.preview.fockus.dev` record.

## Next

- **Phase 03 (previews)**: needs the Cloudflare token (CONTENT_CHECKLIST #1) and `*.preview.fockus.dev`.
- Cosmetic, own unit: update.sh's last line prints the previous release twice.
- Closed code to fix in its own unit: `infra/server-ready.sh` resets /etc/kit-deploy to 0700 (update.sh heals it).
- Bump the templates' actions off Node 20 (phase 08, when they move into the kit).

## Phases

| # | Phase | Status |
|---|---|---|
| 01 | Server ready | done 2026-11-11 (nmap: PR #4 merged, run pending) |
| 02 | One site by hand | done 2026-11-13 |
| 03 | Previews | next |
| 04 | Variables and databases | pending |
| 05 | Dashboard (kit UI phases in `phases/ui/`) | pending · brief in `design/BRIEF-kit-deploy.md` |
| 06 | Alerts and cron | pending |
| 07 | First real project: maranatha | pending |
| 08 | Back into the kit | pending |
| 09 | Final QA ("Done when") | pending |
