# Current Phase — kit-deploy

> A board, not a diary: ≤ 60 lines / 4 KB. Narrative → `PHASE_LOG/<branch>.md`.
> Local file: backed up with `bun run context:backup` (branch `context-state`).

## Now

**Phase 04 — Variables and databases: done 2026-11-17** (#33–#43, plan `plans/04-variables.md`, log
`PHASE_LOG/04-variables.md`). On the VPS: release 01076756b752 (2026-11-18), migrations 0006–0008.
Close checks passed on the VPS; phase security-review done (F1 fixed in #42). A real kd-hello run of
build-env / secret in container / rebuild waits for César's steps (Blocked).

**Phase 05 — Dashboard (in progress, in parallel with the phase-04 ship)** · wave 1 of 4 ·
plan `plans/phase-05-dashboard.md` · no Claude Design handoff: UI from the brief (D021).

| Unit | PR | Status |
|---|---|---|
| W1 shell (layout, theme, session for QA) | — | running |
| W2 agent logs (D014) | — | running |
| W3 metrics (D015, migration 0009) | — | running |
| W4 domains backend (F6, migration 0010) | — | running |

## Blocked (actions for César or external)

- Phase 04 (César): master.key into the password manager (CONTENT_CHECKLIST #4);
  `ssh kit-vps kit-deploy project pin kd_hello Fockus26/kd-hello`; Actions: Read and write on the
  GitHub status token; new deploy-vps.yml + Dockerfile into kd-hello; `db create kd_hello` only if
  it needs a DB. Then the first real build-env / secret-in-container / rebuild run on kd-hello.
- Phase 03 leftover: the dashboard cookie is host-only in the browser (César).
- Each new project's repo must be added to the GitHub status token (Repository access); when the
  token expires, re-run `ship.sh … --install --github-token`.
- QA pendiente: once at the end (phase 09), per César 2026-11-10.
- CONTENT_CHECKLIST #12, #14: César confirms the "preview no existe" and "preview dormido" copy.

## Next

- Before moving a real project (César asked 2026-11-18): the real kd-hello run, alerts (06), and
  the brief's "Done when" checks (load test during deploy, reboot, kit-deploy stopped, nmap,
  certbot dry-run). Proposed 06 before 05; 05 had already started in another session.
- fail2ban jail for `kit-deploy-auth: failed sign-in` (own small infra unit, D003).
- César: passkey in his password manager, then passkey sign-in + cookie check in the browser.
- Own small units: update.sh's last line prints the previous release twice; `server-ready.sh`
  resets /etc/kit-deploy to 0700 (update.sh heals it); templates' actions off Node 20 (phase 08).

## Phases

| # | Phase | Status |
|---|---|---|
| 01 | Server ready | done 2026-11-11 (nmap: PR #4 merged, run pending) |
| 02 | One site by hand | done 2026-11-13 |
| 03 | Previews | done 2026-11-17 (browser cookie check pending) |
| 04 | Variables and databases | done 2026-11-17 (real kd-hello run pending César's steps) |
| 05 | Dashboard (kit UI phases in `phases/ui/`) | in progress (another session, wave 1) |
| 06 | Alerts and cron | pending |
| 07 | First real project: maranatha | pending |
| 08 | Back into the kit | pending |
| 09 | Final QA ("Done when") | pending |
