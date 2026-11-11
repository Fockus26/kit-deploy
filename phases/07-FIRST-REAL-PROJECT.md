# Phase 07 — First real project: maranatha

## Goal

maranatha serves production and previews from the VPS (D004).

## Scope

- In maranatha's repo (its own PRs there): `templates/Dockerfile` + `deploy-vps.yml`, `output:
  'standalone'`, `deploymentId`, `/api/health`; replace `@vercel/analytics` (decision there); settle
  its production branch (today `vercel`/`vps`).
- Register it, move its variables (`env set`, César types secrets), its databases (`kit-db`).
- `maranatha.fockus.dev` (DNS-only record). Its own domain later, when its DNS is César's
  (CONTENT_CHECKLIST #9): TTL lowered the day before.
- Vercel kept one week as the fallback, then César decides.

## Closes when

- [ ] maranatha's production and a PR preview run from the VPS for a week without an incident.
- [ ] The migration steps written down for the next projects (feeds phase 08).
