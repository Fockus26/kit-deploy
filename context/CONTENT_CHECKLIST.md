# Content Checklist — kit-deploy

> Real content and César's actions that the code waits for. No agent invents this content;
> when they find or create a placeholder, they add a row here. Secrets are typed by César in
> his own terminal (stdin) or in a dashboard field — never in the chat.

| # | What is missing | Where (file/component) | Flagged by | Phase | Status |
|---|---|---|---|---|---|
| 1 | Cloudflare API token limited to **DNS edit on the zone fockus.dev** (Caddy DNS-01); César writes it into `/etc/caddy/cloudflare.env` on the VPS | `infra/` Caddy unit | kickoff (D001) | 01 | Resolved (2026-11-13: DNS Write + Zone Read on fockus.dev, IP 178.238.238.7, no expiry; file root 0600) |
| 2 | DNS-only records → 178.238.238.7: `*.fockus.dev` (covers `deploy` and every `<project>.fockus.dev`, D020) done 2026-11-12; `*.preview` done 2026-11-13; `maranatha` in phase 07 | Cloudflare | kickoff (D001) | 01–03, 07 | Partial (wildcards done; maranatha in 07) |
| 3 | Brevo: verify fockus.dev (SPF/DKIM/DMARC records in Cloudflare) and create the API/SMTP key (secret, `env set`) | phase 06 alerts | kickoff (D002) | 06 | Pending |
| 4 | Copy `/etc/kit-deploy/master.key` into César's password manager right after it is generated | VPS | kickoff (D012) | 01/04 | Resolved (2026-11-11) |
| 5 | GHCR read-only token for the VPS (`docker login ghcr.io` as root, typed by César) — classic, `read:packages`, expires ~2027-11-12: renew before | VPS | kickoff | 02 | Resolved (2026-11-12) |
| 6 | `gh secret set KIT_DEPLOY_TOKEN` in each project's repo: `ssh kit-vps kit-deploy token create <p> \| gh secret set KIT_DEPLOY_TOKEN -R <owner/repo>` (never on screen) | each repo | kickoff | 02, 07 | kd-hello done (2026-11-12); maranatha in 07 |
| 7 | Register César's passkey and TOTP at the first login; store the recovery codes | `/enrol` | kickoff (D003) | 03 | Partial (2026-11-14: TOTP + recovery codes done, sign-in verified; 2 passkeys registered but outside his password manager; to redo, César's call) |
| 8 | César's alert recipient address (his Gmail), set as a plain variable | phase 06 | kickoff (D002) | 06 | Pending |
| 9 | maranatha's own domain: DNS under César's control (then add it, TTL lowered the day before) | maranatha | kickoff (D004) | after 07 | Pending |
| 10 | Logo, isotype, favicon, apple touch icon — designed by Claude Design from the brief | `design/` → `app/` | kickoff | 05 | Pending |
| 11 | UI copy of empty states and errors: realistic Spanish placeholders from the handoff, César confirms | phase 05 | kickoff | 05 | Pending |
| 12 | Copy of the "preview no existe" page (title, one sentence, link to the dashboard): realistic Spanish placeholder, César confirms | `infra/caddy/pages/preview-missing.html` | phase 03 U1 | 03 | Pending |
| 13 | Copy of `/login`, `/enrol` (3 steps, expired-link error) and the signed-in placeholder at `/`: realistic Spanish placeholder, César confirms | `app/login/`, `app/enrol/`, `lib/auth/messages.ts` | phase 03 U3 | 03 | Pending |
| 14 | Copy of the "preview dormido" page (title, one sentence: why it sleeps and that its next push wakes it; project · PR): realistic Spanish placeholder, César confirms | `infra/caddy/pages/preview-asleep.html` | phase 03 U5 | 03 | Pending |
| 15 | Copy of the Inicio placeholder (title, subtitle): realistic Spanish placeholder, César confirms | `app/(panel)/page.tsx` | phase 05 W1 | 05 | Resolved (replaced by rows 24–26) |
| 16 | Copy of the project header placeholder (state, domain, branch@SHA, actions) | `app/(panel)/p/[project]/layout.tsx` | phase 05 W1 | 05 | Resolved (replaced by rows 24–26) |
| 17 | Copy of the Resumen tab placeholder | `app/(panel)/p/[project]/page.tsx` | phase 05 W1 | 05 | Resolved (replaced by rows 24–26) |
| 20 | Spanish words of the kit components: Copiar / Copiado / No se pudo copiar, "casi lleno", Siguiendo / En pausa / Pausar / Reanudar, Cargando …, Cancelar, state names (Activo, Listo, Construyendo, Dormido, Guardado, Falló, Error, Verificando DNS, Emitiendo certificado, Aviso) and relative times (hace unos segundos, hace N min, hace N h, ayer, hace N días): from HANDOFF §2, César confirms | `components/kit/*`, `lib/kit/relative-time.ts` | phase 05 W5 | 05 | Pending |
| 21 | Sample copy of the dev gallery (project names, SHAs, log lines, notices): invented for screenshots only, never reaches production (404) | `app/(panel)/dev/componentes/gallery.tsx` | phase 05 W5 | 05 | Pending |
| 22 | Deployments table shows only the SHA: commit message and author are not stored (brief §6 Despliegues asks for them) — César decides: store them at deploy or leave SHA only | `lib/panel/data/` | phase 05 W6 | 05 | Pending |
| 23 | Previews show "#<n>" without the PR title (not stored) — César decides: store it or leave the number | `lib/panel/data/` | phase 05 W6 | 05 | Pending |
| 27 | Copy of the Variables page (intro, post-save notices, delete dialog) | `app/(panel)/p/[project]/env/` | phase 05 W9 | 05 | Pending |
| 28 | Copy of the Dominios page (intro, DNS help, states, remove dialog) | `app/(panel)/p/[project]/domains/` | phase 05 W9 | 05 | Pending |
| 29 | Copy of the Previews page (limit notice, empty state) | `app/(panel)/p/[project]/previews/` | phase 05 W9 | 05 | Pending |
| 30 | Copy of the Logs page (descriptions, "Sin líneas para esta búsqueda", "Se perdió el seguimiento…") | `components/logs/` | phase 05 W10 | 05 | Pending |
| 31 | Copy of the Bases page; **fact to confirm:** "kit-db hace un backup cada noche" (backup OK threshold 36 h), "Sin copia fuera del servidor…" | `components/databases/` | phase 05 W10 | 05 | Pending |
| 32 | Copy of /new (form help, token card, pin command text) | `app/(panel)/new/` | phase 05 W11 | 05 | Pending |
| 33 | Copy of the Alertas card ("Llega en la fase 06") | `app/(panel)/settings/` | phase 05 W11 | 05 | Pending |
| 34 | Copy of Ajustes and of the restyled /login and /enrol | `app/(panel)/settings/`, `app/login/`, `app/enrol/` | phase 05 W11 | 05 | Pending |
| 24 | Copy of Inicio: subtitle "N proyectos · último despliegue …", "El servidor aún no ha enviado lecturas", "Sin alertas abiertas", the empty-projects state | `app/(panel)/page.tsx`, `components/panel/projects-table.tsx` | phase 05 W8 | 05 | Pending |
| 25 | Copy of the project header and Resumen: "Sin nada en vivo en producción…", result notices of Redeploy / Reiniciar / Parar / Rollback, the rollback and stop dialogs, "Aún no hay métricas", "Sin previews", "Producción aún no ha escrito líneas de log" | `components/panel/project-actions.tsx`, `lib/kit/outcome.ts`, `rollback-button.tsx`, `app/(panel)/p/[project]/page.tsx` | phase 05 W8 | 05 | Pending |
| 26 | Copy of Despliegues: "Aún no hay despliegues", the status filter words, the detail Sheet labels (Imagen, Contenedor, Puerto, Health check, Creado, Terminó) | `components/panel/deployments-table.tsx`, `deployment-filters.tsx`, `deployment-sheet.tsx` | phase 05 W8 | 05 | Pending |
| 35 | Copy of the 404 ("Esta página no existe", "Puede que el proyecto se haya renombrado o borrado.", "Volver a Inicio") | `components/states/not-found-card.tsx` | phase 05 W12 | 05 | Pending |
| 36 | Copy of the 500 ("Algo falló en el panel", "Los sitios siguen sirviendo…", "Petición <id>", "Si se repite, busca ese id en los logs del panel.") and of global-error | `app/(panel)/error.tsx`, `app/global-error.tsx` | phase 05 W12 | 05 | Pending |
| 37 | The agent-down notice (one text for every page: "Los sitios siguen sirviendo: no dependen del panel." + "Diagnóstico en el servidor: systemctl status kit-agent") | `components/kit/agent-down-notice.tsx` | phase 05 W12 | 05 | Pending |

| 38 | Copy of the alert emails and alert titles ("<p> no responde", "El certificado de <host> vence en N días", "Disco del VPS al N %", "Memoria del VPS al N %", "Falló el backup de <db>", "Falló el despliegue de <p>", ABIERTA/RESUELTA, the footer line) — thresholds to confirm: disk 80 %, memory 90 % for 5 min, site 3 min down / 5 min up | `lib/alerts/checks.ts`, `lib/alerts/email.ts`, `lib/alerts/rules.ts` | phase 06 U1 | 06 | Pending |

<!-- Mark "Resolved" (do not delete the row) when it is done and the code is updated. -->
