# Current Phase — kit-deploy

> A board, not a diary: ≤ 60 lines / 4 KB. Narrative → `PHASE_LOG/<branch>.md`.
> Local file: backed up with `bun run context:backup` (branch `context-state`).

## Now

**Phase:** 02 — One site by hand · **Track:** own, infrastructure first (D018)
kit-deploy installed on the VPS 2026-11-13 (César's OK); kd-hello live at https://kd-hello.fockus.dev.

| Unit | PR | Status |
|---|---|---|
| core, agent, CLI base, deploy API, templates, switch, CLI deploy | #5–#11 | merged |
| release over SSH, install.sh, update.sh (D019) | #12 | merged · installed on the VPS |
| project add / domain add / token create (D020) | #13 | merged |
| decisions D019, D020 | #14 | merged |
| commit status after the switch | #15 | merged · on the VPS (aea0ee6d3374), token pending |

Log: `PHASE_LOG/02-one-site-by-hand.md`.

## Closes when (phase 02)

- [x] A merge on kd-hello deploys production · [ ] **the commit gets its status** (built and installed, #15; waits for César's token, then one push to kd-hello to see it)
- [x] Load test during a deploy: 8436/8436 OK (DNS-free run; first run's 8 failures were the load generator's resolver)
- [x] `kit-deploy rollback kd_hello` 15.8 s, no build, 0/1358 failed under load
- [x] Reboot brings it back; with kit-deploy-web stopped the site answers 20/20
- [x] `ssh kit-vps kit-deploy version` → 0.1.0 / 0.1.0
- [x] RAM of one site: kd-hello 41 MB idle, 48 MB under load (limit 256); web 34 MB; agent 45 MB; VPS 1060/7941 MB

## Blocked (actions for César or external)

- **GitHub token for commit statuses** (closes phase 02): fine-grained, only "Commit statuses: read and
  write" on the projects' repos → `bash scripts/ship.sh build/kit-deploy-aea0ee6d3374.tgz --install --github-token`
  (pasted in his terminal). Then a push to kd-hello: its commit must show `kit-deploy/production`.

- QA pendiente: once at the end (phase 09), per César 2026-11-10.
- CONTENT_CHECKLIST #1: Cloudflare token (phase 03, wildcard for previews) and `*.preview.fockus.dev` record.

## Next

- After the token: verify the status on a kd-hello commit → phase 02 closed → phase 03 (previews).
- Cosmetic, own unit: update.sh's last line prints the previous release twice.
- Closed code to fix in its own unit: `infra/server-ready.sh` resets /etc/kit-deploy to 0700 (update.sh heals it).
- Bump the templates' actions off Node 20 (phase 08, when they move into the kit).

## Phases

| # | Phase | Status |
|---|---|---|
| 01 | Server ready | done 2026-11-11 (nmap: PR #4 merged, run pending) |
| 02 | One site by hand | all built and installed; commit status waits for the token (2026-11-13) |
| 03 | Previews | next |
| 04 | Variables and databases | pending |
| 05 | Dashboard (kit UI phases in `phases/ui/`) | pending · brief in `design/BRIEF-kit-deploy.md` |
| 06 | Alerts and cron | pending |
| 07 | First real project: maranatha | pending |
| 08 | Back into the kit | pending |
| 09 | Final QA ("Done when") | pending |
