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
| U3 `/login` + `/enrol` + U3b (cut link, passkey-only re-enrol) | #20, #21 | merged · on the VPS (7112799); César enrolled, TOTP sign-in verified |
| U4 preview access (D013): `/preview-access`, one-time token, `kd_preview`, forward_auth + `kit_preview` gate | #22, #23 | merged (13d7641, 40a837c) · on the VPS with e134cca (2026-11-15) |
| U5 core + agent: `renderPreviewSite` (running / asleep), `preview.write`/`preview.remove`; site.write production-only | #24 | merged (e134cca) · on the VPS 2026-11-15, verified |
| U6 API + preview switch: `POST deploy {sha, pr}` → `pr-<n>` 384 MB, `DELETE /api/v1/preview`, migration 0004 | #25 | merged (c4943ab) · not on the VPS (needs César's OK) |
| U7 GitHub: `kit-deploy/preview` status + PR comment edited in place (marker), "eliminada" on close | #27 | merged (fac43e3) · on the VPS 2026-11-16, verified |
| U8 template `deploy-vps.yml`: `pull_request` → `{sha, pr}` / `DELETE preview`, concurrency per PR, forks + Dependabot skipped with a notice | #28 | merged (d1ef8c5) · kd-hello's workflow not yet updated (needs César's OK) |
| U9 limit 4 + dormido (D017): 5th preview sleeps the least recently pushed; next push wakes it; close cleans it; migration 0005 | #29 | merged (1178451) · not on the VPS (needs César's OK: web release + migration 0005, with U6/U7) |
| U10 | — | pending (see plan) |

Log: `PHASE_LOG/03-previews.md`.

## Closes when (phase 03)

- [ ] A PR on kd-hello gets its URL in the PR in < 5 min, behind the login, and loses it on close
- [ ] The dashboard session cookie is host-only (browser); a `*.fockus.dev` production site never gets it
- [ ] security-review of auth and forward_auth

## Blocked (actions for César or external)

- Each new project's repo must be added to the GitHub status token (GitHub → the token → Repository
  access); no reinstall. The token expires: when it does, re-run `ship.sh … --install --github-token`.

- QA pendiente: once at the end (phase 09), per César 2026-11-10.
- CONTENT_CHECKLIST #12, #14: César confirms the "preview no existe" and "preview dormido" copy.

## Next

- fail2ban jail for `kit-deploy-auth: failed sign-in` (own small infra unit, D003).
- César: passkey in his password manager (2 registered 2026-11-14, neither there; "luego lo arreglamos"), then passkey sign-in + cookie without Domain in the browser (phase close).
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
