# Current Phase — kit-deploy

> A board, not a diary: ≤ 60 lines / 4 KB. Narrative → `PHASE_LOG/<branch>.md`.
> Local file: backed up with `bun run context:backup` (branch `context-state`).

## Now

**Phase:** 04 — Variables and databases (in progress) · **Track:** own, infrastructure first (D018)
Plan agreed 2026-11-17: `plans/04-variables.md` (U1–U8). Phase 03: everything done but the browser check of the host-only cookie (César); its log is `PHASE_LOG/03-previews.md`.

| Unit | PR | Status |
|---|---|---|
| U1 core crypto (AES-256-GCM, HKDF, AAD) + migration 0006 `env_vars`, `audit_log` | #33 | merged (c7c8789) · not on the VPS (goes with the phase release) |
| U2 agent `env.seal` / `env.reveal` (plain or Development only; Prod/Preview secrets `forbidden`) | #34 | merged (28b6ca3) |
| U3 CLI `env ls / set / rm` (stdin, no echo; audit in the same transaction) | #35 | merged |
| U4 switch: variables into the container + root-pinned image repo (security review HIGH fixed) | #36 | merged |
| U5 managed DATABASE_URL (kit-db url at each start, pinned image only) + `db create`; no `*_preview` projects | #37 | merged |
| U6 `env pull` (Development to a pipe/file only; dotenv-safe quoting checked with @next/env) | #38 | merged |
| U7 `/api/v1/build-env` + template (BuildKit secret, BUILD_ENV_HASH) + derived Server Actions key | #39 | merged |
| U8a `redeploy` (generation per deployment, migration 0007, container `-g<n>`) | #40 | merged |
| U8b `rebuild` (workflow_dispatch + `{sha, rebuild}`) | #41 | merged |
| F1 runtime names refused (PATH, NODE_*, LD_*, *_PROXY, ...; migration 0008) | #42 | merged |
| Sweep sees `-g<n>` preview containers | #43 | merged |

All units merged; install test in Docker ALL PASS (94) on main + #43. Phase security-review done (1 MEDIUM, fixed in #42). Left: install test in Docker, then the VPS release with César's OK and the close checks on the VPS.

Log: `PHASE_LOG/04-variables.md`.

## Closes when (phase 04)

- [ ] A secret set from `ssh kit-vps kit-deploy env set` is never readable afterwards (CLI, API, DB dump)
- [ ] `env pull` writes a `.env.local` that runs kd-hello locally
- [ ] A backup of `kit_deploy` alone cannot decrypt any variable
- [x] security-review of crypto and build-env (per unit + phase review 2026-11-17: F1 fixed in #42)
- [ ] (phase 03 leftover) the dashboard cookie is host-only in the browser

## Blocked (actions for César or external)

- Each new project's repo must be added to the GitHub status token (GitHub → the token → Repository
  access); no reinstall. The token expires: when it does, re-run `ship.sh … --install --github-token`.

- QA pendiente: once at the end (phase 09), per César 2026-11-10.
- With the phase release: `ssh kit-vps kit-deploy project pin kd_hello Fockus26/kd-hello` (U4).
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
