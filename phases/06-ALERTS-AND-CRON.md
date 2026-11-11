# Phase 06 — Alerts and cron

## Scope

- Health check per project (`/api/health`, every minute) and the alerts by Brevo (D002): site down /
  back up, certificate < 14 days (including `db.fockus.dev`), disk > 80 %, memory tight, failed backup
  in `kit-db status`, production deploy failed. One email per incident, a "resolved" email, no storm.
- Email layout for the alerts (from the handoff's email section).
- Cron per project (route + schedule, called with the project's `CRON_SECRET`), a log of each run,
  replacing the hand-made systemd timers of `tech/vps-postgres.md`.
- Nightly jobs: prune images (keep 5 per project), sweep closed previews, gzip and expire logs.

## Closes when

- [ ] Each alert, triggered on purpose, reaches César's Gmail from alertas@fockus.dev (not spam).
- [ ] A cron job runs on schedule and its run shows in the log.
