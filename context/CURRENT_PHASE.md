# Current Phase — kit-deploy

> A board, not a diary: ≤ 60 lines / 4 KB. Narrative → `PHASE_LOG/<branch>.md`.
> Local file: backed up with `bun run context:backup` (branch `context-state`).

## Now

**Phase:** 04 — Variables and databases (in progress) · **Track:** own, infrastructure first (D018)
Plan agreed 2026-11-17: `plans/04-variables.md` (U1–U8). Phase 03: everything done but the browser check of the host-only cookie (César); its log is `PHASE_LOG/03-previews.md`.

| Unit | PR | Status |
|---|---|---|
| U1 core crypto (AES-256-GCM, HKDF, AAD) + migration 0006 `env_vars`, `audit_log` | #33 | open (`feat/env-crypto`); not on the VPS (goes with the phase release) |

Log: `PHASE_LOG/04-variables.md`.

## Closes when (phase 04)

- [ ] A secret set from `ssh kit-vps kit-deploy env set` is never readable afterwards (CLI, API, DB dump)
- [ ] `env pull` writes a `.env.local` that runs kd-hello locally
- [ ] A backup of `kit_deploy` alone cannot decrypt any variable
- [ ] security-review of crypto and build-env
- [ ] (phase 03 leftover) the dashboard cookie is host-only in the browser

## Blocked (actions for César or external)

- Each new project's repo must be added to the GitHub status token (GitHub → the token → Repository
  access); no reinstall. The token expires: when it does, re-run `ship.sh … --install --github-token`.

- QA pendiente: once at the end (phase 09), per César 2026-11-10.
- César: add Actions: Read and write to the GitHub status token (phase 04 U8, rebuild).
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
| 03 | Previews | done 2026-11-17 |
| 04 | Variables and databases | in progress |
| 05 | Dashboard (kit UI phases in `phases/ui/`) | pending · brief in `design/BRIEF-kit-deploy.md` |
| 06 | Alerts and cron | pending |
| 07 | First real project: maranatha | pending |
| 08 | Back into the kit | pending |
| 09 | Final QA ("Done when") | pending |
