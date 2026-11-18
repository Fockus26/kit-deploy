# Current Phase — kit-deploy

> A board, not a diary: ≤ 60 lines / 4 KB. Narrative → `PHASE_LOG/<branch>.md`.
> Local file: backed up with `bun run context:backup` (branch `context-state`).

## Now

**Phase 04 — Variables and databases: done 2026-11-17** (#33–#43, plan `plans/04-variables.md`, log
`PHASE_LOG/04-variables.md`). On the VPS: release 01076756b752 (2026-11-18), migrations 0006–0008.
Close checks passed on the VPS; phase security-review done (F1 fixed in #42). A real kd-hello run of
build-env / secret in container / rebuild waits for César's steps (Blocked).

**Phase 05 — Dashboard: code done 2026-11-18** (#44–#57, #61) · all 4 waves merged ·
plan `plans/phase-05-dashboard.md` · no Claude Design handoff: UI from the brief (D021).

| Unit | PR | Status |
|---|---|---|
| W1 shell + design/HANDOFF.md (D021–D023, qa-session) | #49 | merged (ab876fe) |
| W2 agent logs (D014; D024 Docker API, D025 50 MiB/day cap) | #44 | merged (7554d09) |
| W3 metrics (D015; D026–D027, migration 0009) | #46 (replaces #45) | merged (87a3746)
| W4 domains backend (F6; D028–D029, migration 0010) | #47 | merged (4f3a83c) |
| W7 db status (F11; D035 no connections in v1) | #48 | merged |
| W5 UI components (D030–D031) | #50 | merged |
| W6 panel data + Server Actions (D032–D034) | #51 | merged · a project created from the panel needs `ssh kit-vps kit-deploy project pin` (D034) |
| W8 Inicio + Proyecto + Despliegues (D036 proxy 404 after a real session, D037) | #55 | merged |
| W12 states + responsive polish (D043–D044, reflow guard scripts/qa/panel-reflow.mjs) | #57 | merged (53771f4) |
| W13 server polish + audit (D045, migration 0011) + D046 closing | #56 | merged |
| Phase security review (0107675..189125c): 0 C · 0 H · 2 M · 4 L | — | done 2026-11-18 |
| W14 security fixes M1 stop sticks (D050) + M2 DB ownership marker + reserved names (D051) + L1 + L3 | #61 | merged (5c36b94) |
| W9 Variables + Dominios + Previews (D038–D039) | #53 | merged (6c08db2) |
| W10 Logs + Bases (D040, logs/tail + logs/search routes) | #52 | merged (df3eb20) |
| W11 Nuevo proyecto + Ajustes + login (D041–D042) | #54 | merged |

## Blocked (actions for César or external)

- **Phase 05 close:** César's OK for the phase ship (release of main + Docker install test + `ship.sh`), then on the VPS: migrations 0009–0011 applied, timers `kit-deploy-metrics` and `kit-deploy-domain-check` active, a secret set from the panel is never readable, a domain added from the panel serves HTTPS with only the DNS record. Phase 07: `ssh kit-vps kit-deploy db adopt maranatha --yes` (D051).

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

- Before moving a real project (César asked 2026-11-18): the real kd-hello run, alerts (06), and
  the brief's "Done when" checks (load test during deploy, reboot, kit-deploy stopped, nmap,
  certbot dry-run). Proposed 06 before 05; 05 had already started in another session.
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
| 05 | Dashboard (kit UI phases in `phases/ui/`) | in progress (another session, wave 1) |
| 06 | Alerts and cron | pending |
| 07 | First real project: maranatha | pending |
| 08 | Back into the kit | pending |
| 09 | Final QA ("Done when") | pending |
