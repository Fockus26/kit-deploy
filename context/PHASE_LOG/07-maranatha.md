# Phase 07 — First real project: maranatha (2026-11-18)

Run in one session while phase 06 shipped to the VPS in another. Code only: every VPS step is
César's (registration, token, variables, switch), listed in maranatha's `deploy/README.md`.

| Unit | Repo / PR | What |
|---|---|---|
| U1 preview URL | kit-deploy #63 | kit-agent sets `KIT_DEPLOY_PREVIEW_URL=https://<p>-pr-<n>.preview.fockus.dev` on preview containers (docker.ts, after --env-file); reserved name, migration 0014 |
| U2 templates | kit-deploy #64 | `deploy-vps.yml` switch `KIT_DEPLOY_ENABLED` (off = one notice job, nothing fails); `templates/MIGRATING.md` (the migration steps, feeds phase 08) |
| M1 maranatha | maranatha #43 | templates + `NEXT_OUTPUT=standalone` ENV (its D072 gate), `/api/health`, `trustedOrigins` + preview URL, deploy/README rewritten, old SSH/compose files removed. maranatha D093 |

Found on the way:
- maranatha's database already moved to kit-db on 2026-11-09 (its D082): `maranatha` /
  `maranatha_preview`, made by hand → `kit-deploy db adopt maranatha --yes` is needed (D051).
- Production branch already `main` (its D091); `@vercel/analytics` already gated on `VERCEL=1`
  (kept while Vercel is the fallback).
- Template risk checked with a local `docker build`: deps installed on oven/bun (glibc), runtime
  node:alpine (musl) → `sharp` for `next/image`. Result: fine. Run like kit-agent (uid 1001,
  512 MB, cap-drop ALL): `/api/health` 200 with the sha, home 200, `/_next/image` → WebP 200,
  74 MB in use. No template change needed.

Closes when (pending César): the steps in maranatha `deploy/README.md` › "Pasar el sitio a
kit-deploy", then a week of production + a PR preview without an incident; then Vercel off.

## Platform side (2026-11-18, César's OK)

- Release f640b62435a4 (main with #63–#64): install test ALL PASS 103; ship.sh exit 0, migrations 15;
  kit-deploy-web up, alerts 23 checked / 0 failing, kd-hello 200.
- `project add maranatha Fockus26/maranatha --memory 512` + pin; `db adopt maranatha --yes`
  (8 MB each, backed up); `token create | gh secret set KIT_DEPLOY_TOKEN`.
- Variables from Vercel: public ones by the agent (14 prod / 13 preview), the rest by César's
  `copy-env.sh` (26 prod / 24 preview). Not in Vercel either: BINANCE_PAY_* (KYB pending),
  BEHOLD_FEED_EVANGELIO.
- César: he turns maranatha on himself from its project (no KIT_DEPLOY_ENABLED from here).
- Local Docker died mid-build (bbolt SIGBUS in dockerd); volumes backed up to
  `Work/docker-backup/` (52 .tgz) and Docker Desktop reset.
