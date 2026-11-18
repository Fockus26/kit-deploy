# Phase 05 — Dashboard · wave plan

> Written by `orchestrate` on 2026-11-17. César: "continúa con la fase 5 sin interrupción hasta
> completarla, puedes mergear" — so waves run one after another in the same session, PRs are
> squash-merged on green CI, QA once at the end (memory `qa-at-end-not-per-unit`).
> Main folder: `C:\Users\Cesar\Documents\Work\kit-deploy` · Phase file: `phases/05-DASHBOARD.md`

**Design:** canvas made in-session from the brief, approved by César 2026-11-17
(https://claude.ai/artifact/BM2D4sybuXcLoczzjw9b5m) → `design/HANDOFF.md` (D021, W1 commits it).

## Waves

| Wave | Units (branch · what · main files) | Depends on | Status |
|---|---|---|---|
| 1 | W1 `feat/dashboard-shell` · UI 01+02: tokens check, theme switch, sidebar/header layout behind the session, `(panel)` route group · `app/(panel)/`, `components/layout/`, `app/globals.css` | — | merged #49 |
| 1 | W2 `feat/agent-logs` · D014: agent follows container output to daily files (14 d, gzip), ops `logs.tail`/`logs.search`, CLI `logs` · `agent/logs.ts`, `cli/logs-commands.ts` | — | merged #44 |
| 1 | W3 `feat/metrics` · D015: migration 0009 `metric_samples`, sampler (docker stats 30 s + Caddy access log), rollups, CLI `metrics` · `agent/metrics.ts`, `lib/metrics/`, `infra/` timer | — | merged #46 |
| 1 | W4 `feat/domains-backend` · F6: domain add/remove/list with www redirect choice, DNS resolve check every minute, cert state/expiry; migration 0010 · `lib/domains/`, `lib/core/caddy.ts`, `cli/domain-commands.ts` | W3 merged first (migration number) | merged #47 |
| 2 | W5 `feat/ui-components` · UI 03: StatusBadge, CopyValue, RelativeTime, Meter, DataTable (TanStack), ConfirmDialog, LogViewer, Sparkline (shadcn Chart) · `components/kit/` | W1 | merged #50 |
| 2 | W6 `feat/panel-data` · read layer + Server Actions (env set/rm, rollback/redeploy/restart/stop, domain add/rm, db create, new project + token), QA seed of realistic data · `lib/panel/`, `app/(panel)/actions/`, `scripts/qa-seed.ts` | W2–W4 | merged #51 |
| 2 | W7 `feat/agent-db-status` · F11: ops `db.list`/`db.status` (size, connections, last backup) via kit-db · `agent/`, `cli/` | — | merged #48 |
| 3 | W8 `feat/page-home-project` · Inicio + Proyecto/Resumen + Despliegues (+detalle) | W5, W6 | merged #55 |
| 3 | W9 `feat/page-env-domains-previews` · Variables + Dominios + Previews | W5, W6 | merged #53 |
| 3 | W10 `feat/page-logs-databases` · Logs + Bases de datos | W5, W6, W7 | merged #52 |
| 3 | W11 `feat/page-new-settings` · Nuevo proyecto + Ajustes (acceso, tokens, auditoría; alertas = fase 06) + login restyle | W5, W6 | merged #54 |
| 4 | W12 `feat/panel-states-polish` · UI 06+08 | wave 3 | merged #57 |
| 4 | W13 `fix/panel-server-polish` · Date.now, errors, audit, D046 | — | merged #56 |
| 4 | W14 `fix/phase05-security` · phase security review M1, M2, L1, L3 | — | merged #61 |

Cut rule: units that touch the same files go in different waves; cross-cutting work last.
Cron page = phase 06 (the tab exists, disabled with "Fase 06").

## Current wave: done (2026-11-18)

- Brief and prompts: `context/plans/orchestration-2026-11-17.md` / `…-prompts.md`
- PRs: —
- QA: at the end (phase 09), per César.

## Closings

| Wave | PRs | QA (C · H · M · L) | Moves to the next | Data not deleted |
|---|---|---|---|---|
| 1 | #44, #46 (repl. #45), #47, #49 | QA at the end (César) | design canvas → HANDOFF | none |
| 2 | #48, #50, #51 | at the end | — | none |
| 3 | #52–#55 | at the end | headings, Date.now → wave 4 | none |
| 4 | #56, #57, #61 | security review 0·0·2·4 → M1, M2, L1, L3 fixed in #61; L2, L4 backlog | — | none |

## Start prompt for the next wave

```
/orchestrate wave 2 of phase 05. Plan: context/plans/phase-05-dashboard.md
```
