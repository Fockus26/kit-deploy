# Current Phase — kit-deploy

> A board, not a diary: ≤ 60 lines / 4 KB. Narrative → `PHASE_LOG/<branch>.md`.
> Local file: backed up with `bun run context:backup` (branch `context-state`).

## Now

**Phase 04** done 2026-11-17 (log `PHASE_LOG/04-variables.md`). **Phase 05** shipped 2026-11-18
(release 5c36b947709b; units W1–W14 #44–#61 in `PHASE_LOG/05-dashboard.md`).

**Phase 06 — Alerts and cron: merged 2026-11-18** (#58 alerts D047, #59 cron D048, #60 image prune
D049, #62 panel Cron tab + alerts D052; log `PHASE_LOG/06-alerts-cron.md`). Security review: no
findings. On the VPS: release b5c1c45302c6 (2026-11-18), install test ALL PASS 102, migrations 0012–0013; 6 timers active, first alerts check: 23 checked, 0 failing.

## Blocked (actions for César or external)

- **Phase 06 close (César):** verify fockus.dev in Brevo (SPF/DKIM/DMARC in Cloudflare), then
  `ssh -t kit-vps kit-deploy alerts setup --to <gmail>` (key on stdin) and `kit-deploy alerts test`
  → inbox, not spam. Then each alert on purpose and a real cron job (CRON_SECRET in production).
  Copy and thresholds: CONTENT_CHECKLIST #38–#39.

- **Phase 05 close (César):** sign in at deploy.fockus.dev with the passkey, set a secret variable on kd_hello from Variables, check it shows only `••••`/Reemplazar and is never readable, then delete it. Shipped and domain HTTPS check done 2026-11-18. Phase 07: maranatha uses Supabase today; only if its database moves to kit-db, `ssh kit-vps kit-deploy db adopt maranatha --yes` (D051).

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

- Before moving a real project (César asked 2026-11-18): the real kd-hello run, alerts' delivery
  check (06), and the brief's "Done when" checks (load test during deploy, reboot, kit-deploy
  stopped, nmap, certbot dry-run). Then phase 07 (maranatha).
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
| 06 | Alerts and cron | shipped 2026-11-18 (Brevo delivery + real cron check pending César) |
| 07 | First real project: maranatha | pending |
| 08 | Back into the kit | pending |
| 09 | Final QA ("Done when") | pending |
