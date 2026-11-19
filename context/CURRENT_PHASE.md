# Current Phase — kit-deploy

> A board, not a diary: ≤ 60 lines / 4 KB. Narrative → `PHASE_LOG/<branch>.md`.
> Local file: backed up with `bun run context:backup` (branch `context-state`).

## Now

Phases 04–05: logs `PHASE_LOG/04-variables.md`, `PHASE_LOG/05-dashboard.md`.

**Phase 06 — Alerts and cron: merged 2026-11-18** (#58 alerts D047, #59 cron D048, #60 image prune
D049, #62 panel Cron tab + alerts D052; log `PHASE_LOG/06-alerts-cron.md`). Security review: no
findings. On the VPS: release b5c1c45302c6 (2026-11-18), install test ALL PASS 102, migrations 0012–0013; 6 timers active, first alerts check: 23 checked, 0 failing.

**Phase 07 — maranatha: code done 2026-11-18** (kit-deploy #63 KIT_DEPLOY_PREVIEW_URL, #64 template
switch + `templates/MIGRATING.md`; maranatha#43 its D093; log `PHASE_LOG/07-maranatha.md`). Image tested
locally like kit-agent (OK). Waiting on César.

**Batch 2026-11-18 (panel improvements, César):** wave 1 of 2 merged (#66–#70); wave 2 = repo picker + laptop/audit, then full QA. Plan `context/plans/batch-2026-11-18.md`. kd_hello: `sudo kit-deploy project rm kd_hello` after the next ship, with César's OK (DBs kept). Ship applies migrations 0015–0016.

**VPS tuning (César 2026-11-18, from the «$12 server» video):** #72 Caddy upstream keepalive 4s < Node's 5s (no 502 on POSTs) — open; on ship then `kit-deploy regenerate` (check `list` first, D050). Waiting: k6 load test, per-project `--cpus`, Caddy `encode zstd gzip`. Log `PHASE_LOG/fix-caddy-upstream-keepalive.md`.

## Blocked (actions for César or external)

- **Phase 07 (César, from maranatha's project):** platform side done 2026-11-18 (release f640b62435a4
  shipped, maranatha registered + pinned, DBs adopted, KIT_DEPLOY_TOKEN set, variables copied from
  Vercel). Left: repo into the status token; turning it on (`KIT_DEPLOY_ENABLED`) is César's. Then a week.
- **Phase 06 close (César):** Brevo done 2026-11-18 (fockus.dev authenticated, sender alertas@fockus.dev,
  restricted key, IP allowlist on with the VPS v4+v6 — projects still on Vercel can't send by Brevo until
  migrated; alerts.env written, `alerts test` arrived). site_down on purpose 2026-11-18 (docker stop kd_hello: opened at the 3rd failing minute, resolved
  after 5 OK, one email each). Left: other alerts if wanted and a real cron job
  (CRON_SECRET in production). Copy and thresholds: CONTENT_CHECKLIST #38–#39.

- **Phase 05 close (César):** sign in at deploy.fockus.dev with the passkey, set a secret variable on kd_hello from Variables, check it shows only `••••`/Reemplazar and is never readable, then delete it. Shipped and domain HTTPS check done 2026-11-18.

- Phase 04 (César): master.key → password manager (CONTENT_CHECKLIST #4); `project pin kd_hello
  Fockus26/kd-hello`; status token Actions: Read and write; new workflow + Dockerfile in kd-hello
  (now with `KIT_DEPLOY_ENABLED`); then the real build-env / secret / rebuild run.
- Phase 03 leftover: the dashboard cookie is host-only in the browser (César).
- Each new project's repo must be added to the GitHub status token (Repository access); when the
  token expires, re-run `ship.sh … --install --github-token`.
- QA: full panel QA (functional + design) after batch 2026-11-18 wave 2 (César 2026-11-18).
- Wave 2 W6 needs César: a fine-grained GitHub token, All repositories + Metadata: read, written on the VPS (stdin).
- CONTENT_CHECKLIST #12, #14: César confirms the preview copy.

## Next

- Before moving a real project (César asked 2026-11-18): the real kd-hello run, alerts' delivery
  check (06), and the brief's "Done when" checks (load test during deploy, reboot, kit-deploy
  stopped, nmap, certbot dry-run). Phase 08 can start from `templates/MIGRATING.md`.
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
| 05 | Dashboard (kit UI phases in `phases/ui/`) | shipped 2026-11-18 (passkey + secret check pending César) |
| 06 | Alerts and cron | shipped 2026-11-18, email + site_down on purpose OK (real cron pending, phase 07) |
| 07 | First real project: maranatha | code done 2026-11-18 (César's VPS steps + one week pending) |
| 08 | Back into the kit | pending |
| 09 | Final QA ("Done when") | pending |
