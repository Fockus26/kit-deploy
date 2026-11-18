# D050 · Panel · Cron tab and alerts are read-only in the panel; managed from the CLI · Confirmed (2026-11-18)

**Decision:** the project's Cron tab (now enabled) lists the jobs (route, UTC schedule, Activo /
En pausa, next run, short id) and the last 50 runs (when, route, Correcto / Falló / En curso, HTTP
code, duration, detail); its empty state shows the `kit-deploy cron add` command. Inicio's
"Alertas abiertas" shows one warning Notice per open alert (title, kind, how long, detail, a link
to the project). Ajustes › Alertas replaces the "Fase 06" placeholder with what is alerted, when
the last email went out, the `alerts setup` / `alerts test` commands and the last 10 alerts with
Abierta / Resuelta. No form adds, pauses or removes a job, and the panel never reads or shows the
Brevo key: both are done over SSH (`kit-deploy cron …`, `kit-deploy alerts setup`).
**Why:** the visual choice is the conservative one (existing DataTable, StatusBadge, Notice and
CommandLine; no new component or token), and the kit's agents, who create the cron routes, work
over SSH (brief F14). A panel form would need new Server Actions and audit paths for a v1 with one
user; the Brevo key is root's (D047).
**Discarded alternative:** add/pause/run buttons in the Cron tab (more surface; can come in v1.x
on the same `CronAdmin` store); an alerts settings form (the key would pass through the web app).
