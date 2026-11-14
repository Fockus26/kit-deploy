# Current Phase — kit-deploy

> A board, not a diary: ≤ 60 lines / 4 KB. Narrative → `PHASE_LOG/<branch>.md`.
> Local file: backed up with `bun run context:backup` (branch `context-state`).

## Now

**Phase:** 03 — Previews (in progress) · **Track:** own, infrastructure first (D018)
Plan agreed 2026-11-13: `plans/03-previews.md` (U1–U10). Phase 02 closed 2026-11-13 (`PHASE_LOG/02-one-site-by-hand.md`).

| Unit | PR | Status |
|---|---|---|
| U1 wildcard site `*.preview.fockus.dev` (DNS-01, 404 page, noindex) | #17 | merged · on the VPS (f8632b5), cert issued, verified |
| U1b update.sh restarts Caddy without the token; bounded reload | #18 | merged (e7f4855) · on the VPS with ddeddee |
| U2 auth backend (Better Auth, passkey + TOTP, `user create`) | #19 | merged (ddeddee) · on the VPS 2026-11-13, verified |
| U3 `/login` + `/enrol` pages (passkey, TOTP, recovery codes; proxy to /login) | #20 | CI green; merge, then ship with César's OK and his enrolment |
| U4–U10 | — | pending (see plan) |

Log: `PHASE_LOG/03-previews.md`.

## Closes when (phase 03)

- [ ] A PR on kd-hello gets its URL in the PR in < 5 min, behind the login, and loses it on close
- [ ] The dashboard session cookie is host-only (browser); a `*.fockus.dev` production site never gets it
- [ ] security-review of auth and forward_auth

## Blocked (actions for César or external)

- Each new project's repo must be added to the GitHub status token (GitHub → the token → Repository
  access); no reinstall. The token expires: when it does, re-run `ship.sh … --install --github-token`.

- QA pendiente: once at the end (phase 09), per César 2026-11-10.
- CONTENT_CHECKLIST #12: César confirms the "preview no existe" copy.

## Next

- fail2ban jail for `kit-deploy-auth: failed sign-in` (own small infra unit, D003).
- César enrols (`ssh -t kit-vps kit-deploy user create <email>`) once U3's `/enrol` page is live.
- Cosmetic, own unit: update.sh's last line prints the previous release twice.
- Closed code to fix in its own unit: `infra/server-ready.sh` resets /etc/kit-deploy to 0700 (update.sh heals it).
- Bump the templates' actions off Node 20 (phase 08, when they move into the kit).

## Phases

| # | Phase | Status |
|---|---|---|
| 01 | Server ready | done 2026-11-11 (nmap: PR #4 merged, run pending) |
| 02 | One site by hand | done 2026-11-13 |
| 03 | Previews | in progress |
| 04 | Variables and databases | pending |
| 05 | Dashboard (kit UI phases in `phases/ui/`) | pending · brief in `design/BRIEF-kit-deploy.md` |
| 06 | Alerts and cron | pending |
| 07 | First real project: maranatha | pending |
| 08 | Back into the kit | pending |
| 09 | Final QA ("Done when") | pending |
