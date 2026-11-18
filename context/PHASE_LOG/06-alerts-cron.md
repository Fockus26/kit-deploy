# Phase 06 — Alerts and cron (2026-11-18)

Run in one session while phase 05's last units (W12 #57, W14 #61) closed in another. Independent:
backend + two panel pieces over the phase-05 shell.

| Unit | PR | What |
|---|---|---|
| U1 alerts | #58 | alerts + alert_checks (0012), `alerts check/ls/setup/test`, Brevo digest, ops platform.certs + backups.status, kit-deploy-alerts.timer (1 min). D047 |
| U2 cron | #59 | cron_jobs + cron_runs (0013, audit cron.*), `cron ls/add/rm/pause/resume/run/runs/tick`, op cron.call (secret opened in the agent, port = project's running production), kit-deploy-cron.timer (:00). D048 |
| U3 images | #60 | op images.prune (pinned repos only, keep 5 + in use, rm without -f), kit-deploy-images-prune.timer (04:45). D049 (sweep + logs rotation already existed) |
| U4 panel | #62 | Cron tab (read only), Inicio open alerts, Ajustes › Alertas. D052. a11y: axe 0 (light/dark, 320/1280) |

- Security review of the phase: no findings ≥ 8 (cron.call bound by AAD + port + path regex,
  redirect manual; images.prune pinned-only; email escaped; alerts.env 0600 validated).
- Decision numbers: the other session's #61 took D050/D051 → panel decision renumbered D052.
- Thresholds/copy for César: CONTENT_CHECKLIST #38 (alerts), #39 (panel copy).
- Closes when (pending César): Brevo key + fockus.dev verified in Brevo →
  `ssh -t kit-vps kit-deploy alerts setup --to <gmail>`, `alerts test` lands in the inbox, then each
  alert triggered on purpose; a real cron job on a project with CRON_SECRET runs and shows in runs.

## Ship (2026-11-18)

- Release b5c1c45302c6 (main with #58–#62, W12–W14): install test ALL PASS 102; ship.sh exit 0, migrations 14.
- VPS: alerts, cron, images-prune timers active; `alerts check` 23 checked / 0 failing (kd_hello up, certs 83–85 days, disk 16 %, memory 18 %, 15 backups OK); web 200. No alerts.env yet.
