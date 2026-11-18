# Orchestration of 2026-11-17 — prompts, wave 1 of phase 05

Main folder: `C:\Users\Cesar\Documents\Work\kit-deploy`. Shared brief:
`C:\Users\Cesar\Documents\Work\kit-deploy\context\plans\orchestration-2026-11-17.md` — read it first.

---

## W1 — `feat/dashboard-shell`

You are worker **W1**. Branch: `feat/dashboard-shell`. Decisions: **D021–D023**.
CONTENT_CHECKLIST rows: **15–17**. Model · effort: **opus · medium** (it touches the session
guard and adds a local-session path). Docker: **yes** (only you this wave). Test services: no.

Earlier decisions: D003 (public dashboard, passkey), D006 (shadcn + Tailwind), D007 (technical
dark direction), D013 (preview cookie isolated) — `cat context/decisions/D00{3,6,7}-*.md
context/decisions/D013-*.md`.

### What César asks
> "continúa con la fase 5 sin interrupción hasta completarla"

Phase 05 UI phases 01 (tokens) and 02 (base layout): `phases/ui/01-TOKENS.md`,
`phases/ui/02-LAYOUT-BASE.md`, and `phases/05-DASHBOARD.md`.

### Where it is
- `app/globals.css` — tokens already exist (dark default, light by `prefers-color-scheme`),
  shadcn variable names. Check them against `context/COLORS.md` / `DESIGN_TOKENS.md` /
  `TYPOGRAPHY.md` and fill what is missing (radii, durations, type scale h1/h2/h3/body/table/small/
  label/metric with the 3 breakpoint sizes of the brief §4, shadows md/lg, `size.sidebar` 240px,
  `size.content-max` 1440px). Do not change values that are already there unless they contradict
  `context/`.
- `app/layout.tsx` — root layout (Geist + Geist Mono, `lang="es"`).
- `app/page.tsx` — today a signed-in placeholder inside `AuthShell`; becomes the panel home
  placeholder inside the new shell (the real Inicio page is wave 3).
- `lib/auth/index.ts` (`requestUser`), `lib/auth/next-path.ts` (`LOGIN_PATH`), `proxy.ts` (cookie
  presence redirect), `app/sign-out-button.tsx`.
- `components/ui/` — shadcn primitives present: alert, button, input, label.
- Brief: `design/BRIEF-kit-deploy.md` §2–§5 (visual), §6 "Proyecto" row 2 (the project tabs), §7.

### Approach decided
1. **D021** (write it): "UI built from the design brief and `context/` without a Claude Design
   handoff; a later handoff wins" · Status Confirmed by César's instruction of 2026-11-17 to
   continue without interruption.
2. Route group `app/(panel)/` with a `layout.tsx` that does the real session check
   (`requestUser`, redirect to `LOGIN_PATH` on GET), inside `Suspense` as `app/page.tsx` does now
   (cacheComponents). Move `/` into it. `/login`, `/enrol`, `/preview-access`, `/api/*` stay
   outside.
3. Shell: sidebar 240px from `lg` (logo "kit-deploy", nav: Inicio, Proyectos list — read from
   the `projects` table through a small server-only query in `lib/panel/projects.ts`, Nuevo
   proyecto, Ajustes; sign-out at the bottom), a header with breadcrumbs + theme switch, a mobile
   drawer below `lg` (shadcn `sheet`; add the shadcn components you need with `bunx shadcn add` —
   authorized: sheet, dropdown-menu, separator, tooltip, skeleton, and their Radix deps). Skip
   link "Saltar al contenido". `<main id="contenido">` max 1440px.
4. Theme: dark default; light; "Sistema". A class/`data-theme` on `<html>` set before paint (an
   inline script or `next-themes` — authorized dependency) and `globals.css` keyed on it as well as
   on `prefers-color-scheme` for "Sistema". Persist in a cookie or localStorage (try/catch).
5. Project tabs component `components/layout/project-tabs.tsx` (Resumen, Despliegues, Previews,
   Variables, Dominios, Logs, Bases, Cron — Cron disabled with the text "Fase 06") for later
   pages; route `app/(panel)/p/[project]/layout.tsx` with the header placeholder and tabs, and a
   `page.tsx` placeholder (realistic Spanish copy, flagged, checklist row).
6. **Local session for QA** (new, `scripts/qa-session.ts`, D022): after `bun run qa:local`, the
   later UI workers need a signed-in browser. Design it so it can **never** run against a
   non-local database (refuse unless the DATABASE_URL host is 127.0.0.1/localhost and the database
   name is the qa one qa-local creates); it creates the `.env.test.local` account's user + a
   session through Better Auth's own server API or store (look at `lib/auth/store.ts`,
   `scripts/qa-enrol-link.ts`) and writes a Playwright `storageState` to `.qa/session.json`.
   Document the exact commands in the PR body and in `scripts/qa-session.ts`'s header — later
   prompts will cite them. Never print the cookie value.
7. Seed for the shell: `qa:local` gives an empty database; a project list of 0 shows the empty
   state "Aún no hay proyectos" + "Nuevo proyecto". Insert 2–3 demo projects only in the local
   QA database through your script with a `--demo` flag (names `kd_hello`, `maranatha`), never
   in a migration.

### Known traps
- `proxy.ts` redirects only GET/HEAD; keep it that way (QA-PREVENTION).
- `tests/unit/auth*.test.ts` guard the session flow; run them.
- Next 16: `LayoutProps`, `cacheComponents`, `params` as a Promise — read the local docs.
- No `truncate` alone on project names in the sidebar (tooltip or wrap).

### How to verify
- typecheck, lint, `bun run test`; `bun run build`.
- `qa:local` + your session script, then Playwright (node, `.qa/`): `/` signed-in shows the shell;
  signed-out GET `/` → `/login`; axe light and dark at 320, 768, 1440; keyboard: skip link, nav,
  drawer opens/closes and returns focus, theme switch; no horizontal scroll at 320.
- Screenshots of the shell (dark/light, 360/1440, drawer open) in the PR.

### Closing
Changeset: minor — "Panel: estructura base con barra lateral, cabecera y selector de tema."
PR "Decisión tomada / alternativa" for: theme mechanism, sidebar content. Report the exact
qa-session commands.

---

## W2 — `feat/agent-logs`

You are worker **W2**. Branch: `feat/agent-logs`. Decisions: **D024–D025**. CONTENT_CHECKLIST
rows: none. Model · effort: **opus · medium** (root daemon, files, streaming). Docker: **no**.

Earlier decisions: D014 (logs to daily files, 14 days — implement it, change its status to
Confirmed in the same file), D011 (closed op list), D016 (loopback) —
`cat context/decisions/D014-*.md context/decisions/D011-*.md`.

### What César asks
Brief F8 logs (`C:\Users\Cesar\Documents\Work\web-agent-kit\prompts\VPS-PLATFORM-BRIEF.md`,
`grep -n "F8" …`), D014, and the Logs page needs (brief `design/BRIEF-kit-deploy.md` § "Logs":
deployment, day of the last 14, text search, level; live follow with pause; download).

### Where it is
- `agent/main.ts` — entry; the server loop. A follower is a second long-running task here.
- `agent/deps.ts` — every side effect; `run()` is one-shot. A streaming child process needs a new
  `Deps` method (e.g. `spawnLines(argv, onLine, onExit)`), implemented in `agent/system.ts` and
  faked in `tests/unit/agent-fakes.ts`.
- `agent/ops.ts:174-212` `ManagedContainer` / `parseContainerList` — how managed containers are
  found (labels); `agent/ops.ts` `Agent.execute` — where ops dispatch.
- `agent/protocol.ts:96` — the `Request` union; `containerNameSchema` at :24.
- `cli/env-commands.ts` — model for a new `cli/logs-commands.ts`; `cli/commands.ts:60-110` usage.
- `infra/install.sh`, `infra/update.sh` — Docker daemon log options (`max-size 10m`, `max-file 3`
  per D014: check whether `server-ready.sh` already sets `/etc/docker/daemon.json`; if not, add it
  there idempotently and say so).

### Approach decided
- Follower in the agent: every ~10 s reconcile the set of running managed containers; for each,
  one `docker logs -f --since <last ts> --timestamps <name>` child; lines appended to
  `/var/lib/kit-deploy/logs/<project>/<YYYY-MM-DD>.log` (UTC) as JSON lines
  `{ts, container, env, stream, line}` (env = production | pr-<n>). Each line capped (e.g. 16 KiB)
  and scrubbed with the existing `scrubUrls` (`agent/ops.ts:71`). Directory 0750 root:kit-deploy?
  — **no**: the web app never reads files; only the agent does. Root 0700.
- Daily rotation: files older than today gzipped; older than 14 days removed. On restart, resume
  from the last timestamp in today's file (no duplicates, no gap).
- Ops (append to the union): `logs.tail { project, env?: "production" | pr, lines ≤ 500 }` →
  last lines; `logs.search { project, day: YYYY-MM-DD within 14 days, query: literal string ≤ 200
  chars (no regex from the client), env?, limit ≤ 1000, before?: cursor }` → matches newest first.
  Level: derive `level` per line (error/warn/info by simple patterns or JSON `level` field);
  filter param optional. Results bounded in bytes.
- CLI: `kit-deploy logs <project> [--pr <n>] [--day <date>] [--grep <text>] [-n <lines>]
  [--json]`; `-f` follows by polling `logs.tail` every 2 s (no streaming socket protocol change).
- The live view in the dashboard will poll the same op (wave 2 builds the API).

### Known traps
- Paths: `project` comes validated by zod; still build paths with a whitelist join and assert the
  result stays under the logs root (no `..`).
- A container that restarts gets a new `docker logs` child; kill children of removed containers.
- Bun on Windows: tests use fakes only; never spawn docker in tests.
- Timeouts on every `run()`.

### How to verify
- `tests/unit/agent-logs.test.ts`: write path, rotation (gzip + 14-day removal with a fake clock),
  resume without duplicates, tail/search bounds, path traversal refused, scrub applied, op schema
  rejects regex-ish/oversized input. typecheck, lint, `bun run test`, `bun run build:agent`.
- `security-review` skill on your diff.

### Closing
Changeset: minor — "Logs de cada contenedor guardados 14 días; `kit-deploy logs` para verlos y
buscarlos." Manual actions: none (ships with the phase release).

---

## W3 — `feat/metrics`

You are worker **W3**. Branch: `feat/metrics`. Decisions: **D026–D027**. CONTENT_CHECKLIST rows:
none. Migration: **`0009_*`**. Model · effort: **opus · medium** (migration, root daemon).
Docker: **no**.

Earlier decisions: D015 (docker stats 30 s + Caddy JSON access log; rollups 1 min/48 h and
1 h/30 days in `metric_samples` — implement it, status → Confirmed), D012 (data model), D011 —
`cat context/decisions/D015-*.md context/decisions/D012-*.md`.

### What César asks
Brief F9 (`grep -n "F9" C:\Users\Cesar\Documents\Work\web-agent-kit\prompts\VPS-PLATFORM-BRIEF.md`):
CPU and memory per container against its limit, VPS disk and memory, requests and 5xx per
project from Caddy's logs. Pages that consume it (wave 3): Inicio "Estado del servidor" (memory,
disk, load vs total) and Proyecto "Métricas" (CPU, memory vs limit, requests 24 h, 5xx 24 h, mini
chart).

### Where it is
- `lib/db/schema.ts` — add `metric_samples` (and anything else you need) at the end;
  `bun run db:generate` → `drizzle/0009_*.sql` + snapshot. Look at `drizzle/0006_env_vars.sql` for
  style (checks, indexes).
- `infra/server-ready.sh:146-175` — the `kit_access_log` snippet: Caddy writes JSON access lines
  to `/var/log/caddy/access.log` (rolled by Caddy). `infra/test/in-container.sh:57` shows a line's
  shape (`.request.host`, `.status`).
- The agent has **no database access** (check: `git grep -n db -- agent/` shows none); the CLI on
  the VPS does (`cli/main.ts`, `lib/db/store.ts`). So: the agent samples (op `metrics.sample`), a
  CLI command stores and rolls up.
- `infra/kit-deploy-preview-sweep.{service,timer}` — model for a timer; `infra/update.sh`
  installs them.

### Approach decided
- Op `metrics.sample {}` → `{ at, vps: { memTotal, memUsed, diskTotal, diskUsed, load1 },
  containers: [{ name, project, env, cpuPct, memBytes, memLimitBytes }], requests: [{ host,
  minute, count, count5xx }] }`. Containers from `docker stats --no-stream --format '{{json .}}'`
  filtered to managed ones; VPS from `/proc/meminfo`, `/proc/loadavg`, `df` of `/`. Requests:
  the agent reads `access.log` incrementally from a saved offset (state file under
  `/var/lib/kit-deploy/metrics/`, root 0700; handle rotation by inode/size shrink), aggregates per
  host per minute, returns only completed minutes.
- CLI `kit-deploy metrics collect` (root, timer every 30 s: `OnUnitActiveSec=30s`,
  `AccuracySec=1s`) maps hosts → projects through `domains` and preview hosts, writes 1-min
  rows, rolls 1-min → 1-h, prunes (1-min > 48 h, 1-h > 30 days). Idempotent: unique key
  (scope, subject, resolution, bucket) + upsert, so a repeated run never double counts (requests
  are added only for minutes not yet stored).
- `kit-deploy metrics <project> [--json]` prints the last values and 24 h totals.
- A read helper `lib/metrics/read.ts` (server-only) for the dashboard: last sample per container,
  24 h series per project (1-min or 1-h buckets), VPS last sample. Unit-tested against PGlite
  if the repo's tests already use it (`grep -rn pglite tests/unit | head -2`), else pure functions
  + SQL kept simple.

### Known traps
- `docker stats` CPU% can exceed 100 (multi-core): store as is and the limit's CPUs if known.
- Bytes from `docker stats` come humanised ("12.3MiB / 512MiB"): parse both units; test it.
- Access log lines can be partial at EOF: keep the remainder for the next read.
- Previews' hosts (`<p>-pr-<n>.preview.fockus.dev`, `lib/core/target.ts`) map to the project too
  (env pr-<n>).
- W4 adds migration 0010 after you: merge order is yours first.

### How to verify
- Tests: stats parsing, log offset + rotation + partial lines, minute aggregation, rollup and
  prune with a fake clock, idempotency of two collects, op schema. typecheck, lint, `bun run
  test`, `bun run build:agent`, `bun run build:cli`. `security-review` on the diff.

### Closing
Changeset: minor — "Métricas de CPU, memoria, peticiones y errores 5xx por proyecto y del
servidor."

---

## W4 — `feat/domains-backend`

You are worker **W4**. Branch: `feat/domains-backend`. Decisions: **D028–D029**.
CONTENT_CHECKLIST rows: **18–19** (only if you add user-facing copy). Migration: **`0010_*`** —
W3 adds 0009 first: write yours, and when the orchestrator tells you W3 merged, `git rebase
origin/main`, delete your generated migration + snapshot and `bun run db:generate` again so it
numbers 0010 on top. Model · effort: **opus · medium** (Caddy config, certificates, data).
Docker: **no**.

Earlier decisions: D020 (default `<project>.fockus.dev`, wildcard A record → 178.238.238.7,
HTTP-01 per host), D001, D016 — `cat context/decisions/D020-*.md context/decisions/D001-*.md`.

### What César asks
Brief F6: "Add a domain to a project: the page shows the DNS records to create, checks they
resolve to the VPS, and Caddy gets the certificate. `www` redirected to the apex (or the reverse,
a choice per domain). Certificate state and expiry visible." Phase 05 closes when "a domain added
from the page serves HTTPS with no manual step besides the DNS record".

### Where it is
- `lib/db/schema.ts:156-180` — `domains` (host only today).
- `cli/commands.ts` — `domain add <project> <host>` exists (grep `domain add`); `project add
  --domain`; `lib/deploy/drizzle-repo.ts:33` reads hosts for the site file.
- `lib/core/caddy.ts` — `renderSite` (one site file per production target, `hosts[]`); test
  `tests/unit/core-caddy.test.ts`. `agent/protocol.ts` `site.write` (hosts ≤ 50, RESERVED_HOSTS).
- `lib/deploy/switch.ts` — where the site file is written on deploy (`regenerate` too).

### Approach decided
- Columns on `domains` (migration 0010): `redirect` (`none` | `to_apex` | `to_www`, default
  `none`), `status` (`pending_dns` | `issuing` | `ready` | `error`), `dns_checked_at`,
  `dns_ok_at`, `cert_not_after`, `last_error` (short text, never a secret). Existing rows (the
  default `<p>.fockus.dev` and kd-hello's) migrate to `ready`… only if they are served now: set
  `issuing` and let the first check settle them.
- A host is only put into the Caddy site **once its DNS resolves to the VPS** (A/AAAA equal to
  the VPS address, from a constant/env next to the existing ones in `lib/core/constants.ts`; the
  wildcard `*.fockus.dev` counts) — avoids ACME failures and rate limits for hosts not pointed yet.
  The default `<project>.fockus.dev` is always included as today.
- `redirect`: `to_apex` on `www.example.com` adds a Caddy block that 308-redirects to the apex
  (and the reverse). Rendered by `lib/core/caddy.ts` (pure, tested); the agent's `site.write`
  params grow a validated `redirects: [{from, to}]` (≤ 50, each host passes `assertHost`, both
  must belong to the same request's hosts) — or a separate file; decide and record D028.
- `kit-deploy domain check [--project <p>]` (root timer every minute, `infra/` unit in the sweep's
  style): resolves each non-ready host (node `dns.promises` with a timeout — CLI side, no agent op
  needed for DNS), on DNS ok regenerates the project's site file through the existing switch/
  regenerate path, then asks the agent `cert.status { host }` → `{ notAfter, issuer } | null` (the
  agent reads the certificate Caddy stores, or `openssl s_client -servername <host> -connect
  127.0.0.1:443` with a timeout — pick, D029) and moves the row to `ready` / `error`. Ready hosts
  are re-checked hourly for expiry.
- `kit-deploy domain ls <project> [--json]` (host, status, redirect, expiry, DNS records to
  create) and `domain rm <project> <host>` (refuses the default host unless `--force`; rewrites
  the site file). The DNS instructions as data (`lib/domains/dns.ts`: for an apex `A @ →
  178.238.238.7`; for a subdomain `A <label> → …`; `www` + redirect) — the page reuses it.

### Known traps
- `db.fockus.dev` / `deploy.fockus.dev` never (RESERVED_HOSTS, `domains_not_platform` check).
- Removing a host must not drop the site's last host; production must keep answering.
- Every DNS / openssl call with a timeout; a failing check must not block the others.
- CLAUDE.md: `certbot renew --dry-run` after any change to ports 80/443 — you change no ports;
  say so.

### How to verify
- Tests: caddy rendering with redirects (both directions, fmt-stable), status transitions with a
  fake resolver and fake agent, DNS instructions, rm guards, op/param schema. typecheck, lint,
  `bun run test`, `bun run build:cli`, `bun run build:agent`. `security-review` on the diff.

### Closing
Changeset: minor — "Dominios: estado de DNS y certificado, redirección www, `domain ls` y
`domain rm`."

---

# Wave 2 of phase 05

Design: `design/HANDOFF.md` (approved 2026-11-17) wins over the brief for anything visual.
Update a branch with `git merge origin/main` + plain push — never rebase pushed commits or
force-push. Write `.qa/progress.md` from your first wip commit. Hand-written SQL in a migration:
keep it apart and re-add it after `db:generate`.

Reserved: W5 D030–D031, rows 20–21 · W6 D032–D034, rows 22–23, migration 0011 if needed ·
W7 D035, no rows, no migration.

## W7 — `feat/agent-db-status`

You are worker **W7**. Decisions: **D035**. Model · effort: **opus · medium** (root agent op).
Docker: **no**.

### What César asks
Brief F11: "The project's page shows its databases (`kit-db list`/`status`) and creates them."
The Bases page (HANDOFF §3 "Bases de datos") shows per database: name, environment (production /
preview), size, last backup + whether it is OK, and "Crear base" (the existing `db.create` op).

### Where it is
- `agent/ops.ts:531-600` — how the agent already runs `kit-db url` / `kit-db create` (argv, no
  shell, output never echoed); `databaseName()` at `agent/ops.ts:83` (`<project>` and
  `<project>_preview`).
- kit-db itself: `C:\Users\Cesar\.claude\kit-reference\vps\kit-db` lines 103-114. `list` prints
  `datname size` (pg_size_pretty, space-separated, psql unaligned); `status` prints
  `<db>: <file>.dump | NO BACKUP` per database, `Off-VPS: <remote | NOT CONFIGURED>`, then
  `Last failures:` and up to 5 `FAIL …` lines. Read it, do not change it (it belongs to the kit).
- Shared files rule (brief "Shared shapes"): new `agent/databases.ts`, op appended at the end of
  `Request`, one `case`, CLI in `cli/db-commands.ts` (there may already be `db create` in
  `cli/commands.ts` — keep it working, move it only if trivial).

### Approach decided
- Op `db.status { project }` → `{ databases: [{ name, env: "production" | "preview", sizeBytes |
  null, sizeText, lastBackup: { file, at } | null }], offVps: string | null, failures: string[]
  (only lines naming one of this project's two databases, scrubbed) }` — only the project's own
  `<project>` / `<project>_preview`, never other databases' names or sizes. Parse the backup file
  name's timestamp (look at kit-db's `backup_one` for its format).
- Connections: kit-db has no command for them → **not shown in v1**; record in D035 (the Bases
  page drops that column).
- CLI `kit-deploy db status <project> [--json]`.

### How to verify
Tests with fakes for both outputs (including NO BACKUP, NOT CONFIGURED, a failure line of another
database that must be filtered out, odd spacing), op schema. typecheck, lint, `bun run test`,
`build:agent`, `build:cli`; `security-review` on your diff (run it with your slot's path).

### Closing
Changeset: minor — "Bases de datos: tamaño y último backup de cada base del proyecto
(`kit-deploy db status`)."

## W5 — `feat/ui-components`

You are worker **W5**. Decisions: **D030–D031**. CONTENT_CHECKLIST rows: **20–21**. Model · effort:
**sonnet · medium**. Docker: **yes** (only you this wave, for qa:local + `scripts/qa-session.ts` from
W1 — its header has the commands). Launched after W1 (`feat/dashboard-shell`) is merged.

### What César asks
Phase 05 UI 03, `phases/ui/03-COMPONENTS.md`: the components of `design/HANDOFF.md` §2, exactly as
specified there (measures, variants, every state, a11y) — StatusBadge, StatusDot, CopyValue,
RelativeTime, Meter (card + table), Sparkline + MetricCard, DataTable, ConfirmDialog (normal +
type-the-name destructive), LogViewer, Field set (Input/Textarea/Checkbox/Radio with error state),
Notice, EmptyState, Skeleton. Button variants (§2 row Button) on `components/ui/button.tsx`.

### Where it is
- `components/ui/` — shadcn primitives (W1 added sheet, dropdown-menu, skeleton on `radix-ui`).
- `app/globals.css` — tokens (W1 added `--nav`, `--destructive-solid`, `--destructive-on`,
  `--overlay` and the type scale). Do not add tokens: a missing one goes in your report.
- New: `components/kit/*.tsx`, one file per component; a dev-only gallery route
  `app/(panel)/_kit/page.tsx`? — **no**: private routes with `_` are not routed in Next; use
  `app/(panel)/dev/componentes/page.tsx` guarded by `process.env.NODE_ENV !== "production"`
  (`notFound()` in production) for screenshots and axe.

### Approach decided
- Authorized dependencies: `@tanstack/react-table`, `recharts` (via shadcn Chart pattern),
  shadcn `alert-dialog`, `tabs`, `radio-group`, `checkbox`, `textarea`, `tooltip`, `breadcrumb` if W1
  did not add it. Nothing else.
- Components are presentational: props in, no data fetching, no Server Actions. LogViewer takes
  `lines` + `following` + `onTogglePause`; auto-pause when the user scrolls up.
- Spanish copy of the states as in HANDOFF §2 / §5b.

### How to verify
- Unit tests for pure logic (RelativeTime formatting with a fixed clock, Meter thresholds 85/95,
  ConfirmDialog name match, LogViewer auto-pause decision) in `tests/unit/kit-*.test.ts`.
- The gallery page with qa:local + qa-session: axe light and dark at 320 and 1440, keyboard on
  dialog (focus trap, Esc, focus return), tabs, copy; reduced-motion. Screenshots of the gallery.
- typecheck, lint, `bun run test`, `bun run build`.

### Closing
Changeset: minor — "Panel: componentes base (estados, medidores, tablas, diálogos, visor de logs)."

## W6 — `feat/panel-data`

You are worker **W6**. Decisions: **D032–D034**. CONTENT_CHECKLIST rows: **22–23**. Migration:
**0011** only if unavoidable. Model · effort: **opus · high** (Server Actions over secrets, agent
and auth). Docker: **no** (W5 has it; use unit tests). Launched after W1 is merged.

### What César asks
Phase 05 server pieces: everything the pages need to read and every action they trigger, so the
page units of wave 3 are presentation only. Phase close: "A variable can be set from the page and
is never readable afterwards if secret" and "a domain added from the page serves HTTPS with no
manual step besides the DNS record"; "security-review of the server actions".

### Where it is
- Session: `lib/panel/session.ts` (`panelUser()`, W1) — every read and every action calls it
  first; a missing session in an action returns a typed 401 result, never a redirect.
- Logic that today only the CLI reaches — **extract to `lib/ops/<topic>.ts`, call it from both the
  CLI and the actions, keep the CLI's behaviour and tests green**:
  `cli/env-commands.ts` (env set/rm with seal + audit in one transaction; actor `web:<user id>`
  via a `webActor()` next to `sshActor()` in `lib/db/env-store.ts:41`),
  `cli/commands.ts:350` `redeploy`, `lib/deploy/switch.ts:600` `rollback`, `:649` `regenerate`,
  `lib/deploy/rebuild.ts` `dispatchRebuild`, `cli/domain-commands.ts:255` (add with redirect, rm,
  check one project now), `lib/db/admin.ts` (project add) + `lib/tokens.ts` (deploy token, shown
  once), the agent's `container.stop` / `container.start` for Parar / Reiniciar, `db.create`.
- Agent client from the web: `lib/deploy/runtime.ts` (`socketClient`).
- Readers already there: `lib/metrics/read.ts`, `lib/domains/store.ts`, `lib/domains/dns.ts`
  (`dnsInstructions`), `lib/db/env-store.ts`, `lib/preview/store.ts`, `lib/deploy/drizzle-repo.ts`.
  Logs: agent `logs.tail` / `logs.search`. Databases: agent `db.status` (W7, may land during your
  unit — if not merged, code against its documented shape in W7's prompt and say so).

### Approach decided
- Read layer `lib/panel/data/*.ts` (server-only): `homeData()`, `projectOverview(p)`,
  `deployments(p, filter)`, `previews(p)`, `envList(p, environment)` (names, kind, updated, and the
  value **only** for plain vars via `env.reveal`; secrets never leave the agent — the type of a
  secret row has no value field), `domainsData(p)`, `logsTail/logsSearch`, `databases(p)`,
  `settingsData()` (passkeys, tokens with last use, audit page). Agent down → a typed
  `{ unavailable: "agent" }` the page renders as the HANDOFF §5b error, never a throw.
- Server Actions in `app/(panel)/actions/<topic>.ts` (`"use server"`): zod schemas shared with the
  forms (`lib/panel/schemas.ts`: trim + min + max per field as the columns), result type
  `{ ok: true, … } | { ok: false, code, message }` in Spanish; idempotent where a double submit is
  possible (env set = upsert; domain add of an existing host = ok; project add with the same name =
  conflict message); `revalidatePath` of the page. Destructive ones (stop, rollback, rm variable,
  rm domain, revoke token) take the confirmation value (project or host name) and check it on the
  server too.
- Secret value from a form: read once from `FormData`, sealed by the agent, never logged, never
  returned, never put in a revalidation payload or error message. Write a test that a failed seal's
  error message does not contain the value.
- Post-save notice data: `env set` returns `{ needs: "redeploy" | "rebuild" | null }`
  (`NEXT_PUBLIC_*` in production/preview → rebuild).
- New project returns the deploy token **once** in the action result; never stored in plain.
- QA seed: `scripts/qa-seed.ts` (refuses non-local DATABASE_URL exactly like `scripts/qa-session.ts`)
  inserting realistic demo rows (the HANDOFF/canvas data: maranatha + kd_hello, 5 deployments,
  3 previews, env names, 5 domains in each status, metric samples for 24 h, audit rows) so wave 3
  can screenshot every state. Env values seeded as names only (no agent locally → plain values
  render the "agent unavailable" state; document it).

### Known traps
- Next 16 Server Actions: read `node_modules/next/dist/docs/` on actions, `revalidatePath`,
  `cacheComponents` — data reads must be inside Suspense / dynamic.
- `proxy.ts` must not redirect POSTs (it does not today; keep a test).
- CSRF: Server Actions' origin check stays on; do not add an `allowedOrigins` wildcard.
- The web container talks only to the agent socket (D011) — never `docker`, never the master key.

### How to verify
Unit tests per action (session missing → 401 result, schema rejects, confirmation mismatch,
idempotency, secret never in output/errors, needs redeploy/rebuild), per reader (agent down →
unavailable), CLI tests still green after the extraction. typecheck, lint, `bun run test`,
`bun run build`. `security-review` on your diff (pass it your slot path) — High/Critical fixed here.

### Closing
Changeset: minor — "Panel: lectura de datos y acciones (variables, despliegues, dominios, bases,
proyectos) con las mismas reglas que el CLI."

---

# Wave 3 of phase 05 — pages

On `main` be528ac: shell (W1), `components/kit/*` (W5, gallery at `/dev/componentes` in dev),
read layer `lib/panel/data/index.ts` (W6: `homeData`, `projectOverview`, `deployments`,
`deploymentDetail`, `previews`, `envList`, `domainsData`, `logFilters`, `logsTail`, `logsSearch`,
`databases`, `settingsData`; each returns data or `{ unavailable: "agent" }` — test with
`isUnavailable`) and Server Actions `app/(panel)/actions/{env,deployments,domains,projects}.ts`
(signature `(prev, formData)` for `useActionState`; result `{ ok: true … } | { ok: false, code,
message }`). Pages are **presentation only**: no new queries, no new actions. If a page needs data
the layer does not give, the conservative fallback + "Decisión tomada / alternativa" + report it.

Spec: `design/HANDOFF.md` §3 (the page's section), §2 (components), §5b (states). Canvas for the
drawn pages: https://claude.ai/artifact/BM2D4sybuXcLoczzjw9b5m (you cannot open it; HANDOFF has
every value). Headings: h1 = page title; h2 = each section as HANDOFF §3 names it.

**Every page shows:** its data · loading (Skeleton inside the section, Suspense) · empty
(EmptyState) · agent unavailable (Notice destructive per §5b, rest of the page usable) — the
product of states for each section.

**Docker: yes for every unit this wave.** The Postgres container `qa-kit-deploy-pg` is shared and
already running; `qa:local -- --port <your port>` creates your own `qa_<port>` database. Then
`bun scripts/qa-session.ts --port <p> --demo` and `bun scripts/qa-seed.ts --port <p>` (header of
each script). Do not stop or remove the containers. Screenshots: `pr-screenshots.ts` cannot carry
a session — do as W5 did: a Playwright script in `.qa/` with `storageState: ".qa/session.json"`,
PNGs into `.pr-shots/`, then `bun run shots:publish`.

Gates per unit: a11y (axe light+dark at 320/768/1440, keyboard on every form and dialog),
typecheck, lint, `bun run test`, `bun run build`. Update with `git merge origin/main` + plain push.

Reserved: W8 D036–D037 rows 24–26 · W9 D038–D039 rows 27–29 · W10 D040 rows 30–31 ·
W11 D041–D042 rows 32–34. No migrations in this wave. Changesets: minor each.

## W8 — `feat/page-home-project`
Model · effort: **sonnet · medium**. Files: `app/(panel)/page.tsx` (Inicio), `app/(panel)/p/[project]/
layout.tsx` (project header + actions; you are the only unit touching it), `p/[project]/page.tsx`
(Resumen), new `p/[project]/deployments/page.tsx` (+ detail in a right Sheet 480px, `?d=<id>`).
HANDOFF §3 "Inicio", "Proyecto · cabecera", "Pestañas", "Métricas", "Despliegues recientes +
Previews activos", "Logs en vivo" (LogViewer polling `logsTail` every 2 s through a small route
handler or server action you add **only** as a thin wrapper of `logsTail` — say which),
"Despliegues". Header actions: Redeploy (primary), Rollback (ConfirmDialog naming both SHAs),
Reiniciar, Parar (type-the-name ConfirmDialog, destructive-solid); < 768 "Más acciones" dropdown.
`/p/<unknown>` must answer **404** (today 200: `notFound()` inside Suspense — call it before any
streaming, e.g. check existence in the layout outside Suspense). Changeset: "Panel: Inicio,
resumen del proyecto y despliegues."

## W9 — `feat/page-env-domains-previews`
Model · effort: **opus · medium** (the secret form). Files: new `p/[project]/env/page.tsx`,
`p/[project]/domains/page.tsx`, `p/[project]/previews/page.tsx`. HANDOFF §3 "Variables",
"Dominios", "Previews". Variables: the value field is `type` text in a textarea but the secret
value is never put back into the form state after submit (reset the field on success and on
error); `autocomplete="off"`, `spellcheck=false`; the post-save Notice from the action's `needs`
(rebuild → Rebuild button = `rebuildAction`; redeploy → `redeployAction`); delete with
type-the-name ConfirmDialog. Domains: add form with the 3 redirect radios, the DNS instructions of
the selected/last-added host with CopyValue, "Comprobar ahora" = `checkDomainsAction`, remove
with type-the-host ConfirmDialog, cert expiry ≤ 14 days in `--warning`. Previews: list + the
"N de 4 encendidos" Notice. Changeset: "Panel: variables, dominios y previews."

## W10 — `feat/page-logs-databases`
Model · effort: **sonnet · medium**. Files: new `p/[project]/logs/page.tsx`,
`p/[project]/databases/page.tsx`. HANDOFF §3 "Logs" (filters from `logFilters`: deployment, day of
the last 14, literal search, level; live follow polling `logsTail` every 2 s via a thin wrapper —
if W8 already merged one, reuse it, else add `app/(panel)/p/[project]/logs/tail/route.ts` and tell
the orchestrator; search with "Cargar más" using the `before` cursor; Descargar = the current
result as a `.log` text file built client-side) and "Bases de datos" (DataTable without the
connections column — D035; "Backup" = StatusBadge Listo if `lastBackup` < 36 h and no failure,
Aviso otherwise, with the failure text; "Crear base" = `createDatabasesAction`). Changeset:
"Panel: logs con búsqueda y seguimiento, y bases de datos."

## W11 — `feat/page-new-settings`
Model · effort: **opus · medium** (deploy token shown once, passkeys). Files: new
`app/(panel)/new/page.tsx`, `app/(panel)/settings/page.tsx`, restyle of `app/login/*` and
`app/enrol/*` to HANDOFF §3 "Login" with the shell's tokens (keep every auth behaviour and test).
New project: form (`createProjectAction`), then the token card shown once from the action result
(never in a URL, never re-fetchable; "Ya lo guardé" clears it from state), plus the `project pin`
SSH line the result carries (D034). Settings: Acceso (passkeys list from `settingsData`, "Añadir
passkey" through Better Auth's client as `/enrol` does — if it needs an enrolment flow the layer
lacks, show the list read-only + the SSH command `ssh -t kit-vps kit-deploy user create` hint and
report it), TOTP and recovery codes status (read-only in v1 unless the layer offers regenerate),
Alertas (disabled card "Llega en la fase 06"), Tokens (revoke with ConfirmDialog =
`revokeTokenAction`, "Nuevo token" = `createTokenAction` shown once), Auditoría (DataTable,
"Cargar más" with the cursor). Changeset: "Panel: nuevo proyecto, ajustes y acceso con el estilo
del panel."

---

# Wave 4 of phase 05 — states, polish, fixes (last wave)

On `main` after #55: every page of HANDOFF §3 exists. This wave closes the phase. Same rules as
wave 3 (Docker: yes for W12 — shared `qa-kit-deploy-pg`, your own `qa_<port>`; flows on
`qa:local -- --preview`; update with `git merge origin/main` + plain push). Reserved: W12
D043–D044 rows 35–37 · W13 D045–D046 (D046 = the phase's closing decision, see W13), no rows.
Migration 0011 only for W13 and only if unavoidable.

## W12 — `feat/panel-states-polish`
Model · effort: **sonnet · medium**. Files: `app/(panel)/**`, `app/not-found.tsx`,
`app/(panel)/error.tsx` / `global-error.tsx`, `components/**`, `infra/caddy/pages/*.html`.

1. **States (HANDOFF §5b, phases/ui/06-STATES.md):** panel 404 inside the shell (copy of §5b),
   500 (`error.tsx`: "Algo falló en el panel" + Reintentar + the request id/digest in mono),
   `global-error.tsx` minimal; every panel route has its loading Skeleton (Suspense) — audit them;
   preview "dormido" / "no existe" Caddy pages restyled with the same tokens inline (system-ui,
   no external fonts, max 480 card, both themes via `prefers-color-scheme`), keeping their copy
   (CONTENT_CHECKLIST 12, 14) and anything `infra/test/*` checks in them.
2. **One heading rule:** project name = h1 in `p/[project]/layout.tsx`, sub-page titles = h2 —
   fix the pages that use h1 (`env`, `domains`, `previews`); `EmptyState` gets a `level` prop
   (default 2) and the sections with h3 pass 3 (Ajustes › Passkeys).
3. **Unify the agent-down notice:** `components/kit/agent-down-notice.tsx` (W9) and
   `components/panel/agent-down.tsx` (W8) → one, every caller moved, the other file deleted only
   if nothing imports it (it is our own new file from this phase, so deleting it is fine).
4. **LogViewer:** no "En pausa/Reanudar" on a static search (a `follow={false}` mode).
5. **Exit animations** of dropdown, Sheet and dialog per HANDOFF §6 (entry exists; exit missing).
6. **Responsive sweep (phases/ui/08-RESPONSIVE-POLISH.md):** every panel route at 320, 360, 768,
   1024, 1440, 1920, light and dark, with `qa-seed` data: no horizontal scroll, no clipped text,
   button rows wrap, tables scroll in their box, 200 % zoom at 1280. Leave the guard versioned:
   `scripts/qa/panel-reflow.mjs` (node + Playwright, storageState `.qa/session.json`) that walks
   every route and fails on `scrollWidth > clientWidth`; run it on main (before) and your branch.
Changeset: patch — "Panel: pantallas de error y carga, y ajustes de responsive y accesibilidad."

## W13 — `fix/panel-server-polish`
Model · effort: **opus · medium** (auth session, audit). Docker: **no**. Files: `lib/**`,
`app/(panel)/actions/**` only if a signature changes, `tests/unit/**`. Not UI.

1. `lib/auth/session.ts:36` `now = Date.now()` default param makes every panel route log
   "unstable value Date.now() while prerendering" (and once left a page hung): compute `now` inside
   after the request-time API (`await connection()` or the headers read) — read
   `node_modules/next/dist/docs/` on cacheComponents first. Test.
2. `addDomain`: `www.<host>` with `to_apex` and no apex in the project → a specific Spanish
   message (what to add first), not "Ese dominio no es válido.".
3. `stopProject` / `restartProject` of an unknown project → 404 result, not 409.
4. Audit: check whether `project.add`, `token.create`, `token.revoke`, domain add/rm, rollback,
   redeploy, stop, restart from the panel write `audit_log`. The table's `AUDIT_ACTIONS` is
   `["env.set","env.remove"]` (`lib/db/schema.ts:248`) — if the brief's Ajustes › Auditoría ("qué
   variable o acción") needs them, widen it (migration 0011 with the new check values; no data
   change) and write a row in the same transaction as each action, actor `web:<id>` / `ssh:<user>`,
   never a value. Record the call in D045.
5. **D046 · phase 05 closing:** one decision file summarising what phase 05 shipped and deferred
   (passkeys from Ajustes → v1.x, connections column → none, commit message/author and PR title
   not stored → CONTENT_CHECKLIST 22–23, Cron → phase 06, alerts → phase 06). Status Confirmed.
Changeset: patch — "Panel: mensajes de error más claros, auditoría de las acciones y sin avisos de
renderizado."

## W14 — `fix/phase05-security` (phase security review, 2026-11-18)

Model · effort: **opus · high**. Docker: **no**. Decisions **D047–D048**. Migration: none expected.
The phase-05 security review (read-only, over 0107675..189125c) found these; fix them with tests.
Do not touch `app/**` UI files (W12 is there) beyond a message string if unavoidable.

**M1 · "Parar" does not stick.** `lib/deploy/switch.ts:677-678` `regenerate` starts a stopped
container; `lib/ops/deploy.ts:81-94` `stopProduction` leaves the deployment `live`;
`lib/ops/domains.ts:305-316` `rewriteSite` (domain rm / redirect, panel and CLI) and
`lib/domains/check.ts:115-121` (root timer every minute) call `regenerate`. A stopped site comes
back by itself. Fix: `regenerate(sw, { project, start: false })` for site-only rewrites (rewriteSite,
checkDomains) — rewrite the Caddy file, never start a container; keep `kit-deploy regenerate`
(explicit, after a reboot) starting as today. Decide whether a stopped production must also be
remembered (deployment state or a flag) so `regenerate` itself respects it; record in D047. Tests:
stop → domain rm / redirect / check run → container still stopped.

**M2 · Project names that collide with databases kit-deploy does not own.** Names are only checked
by `PROJECT_RE` + the `_preview` suffix (`lib/ops/rules.ts:149`, `lib/panel/schemas.ts:184-188`,
`lib/ops/projects.ts:53`); `agent/ops.ts:548-558` `managedLines` injects `kit-db url <project>` into
the pinned image; `agent/databases.ts:150-181` `db.status` reports that database. A project named
`kit_deploy` (the platform's own DB) or another client's database name gets its URL / status. Fix:
1. Reserved names refused everywhere a project is created or pinned (`kit_deploy`, `postgres`,
   `template0`, `template1`, and anything else kit-db or the platform uses — grep), panel and CLI,
   with a Spanish message on the panel.
2. The agent injects the managed `DATABASE_URL` and answers `db.status` **only for databases
   kit-deploy owns**: `db.create` writes a root marker (`/etc/kit-deploy/dbs/<name>`, 0600, dir 0700,
   no secret inside); a new root-only CLI `kit-deploy db adopt <project>` (SSH, prints what it
   adopts, asks for `--yes`) writes it for a database that existed before (maranatha in phase 07).
   Without the marker: no `DATABASE_URL`, and `db.status` returns the database as "no gestionada"
   without size/backup details. `infra/update.sh` must not break existing projects: document in D048
   that kd_hello has no database today, and whether the release needs a one-time adopt.
3. `projectPin` (`cli/commands.ts:587-609`) refuses reserved names.

**L1** `agent/domains.ts:45-47` reads Caddy's cert with `deps.readFile` (follows symlinks, no cap):
use `readFileFrom(path, 0, 64 KiB)` (regular file, O_NOFOLLOW). Test with a symlink and an
oversized file in the fakes.
**L3** `logs.tail` / `logs.search` unserialized in the root daemon (`agent/ops.ts:290-293`,
`agent/logs.ts:553-566`): a semaphore of 2 concurrent log reads; extra requests wait (bounded) or
get `command_failed` "ocupado" — decide, test.

Leave **L2** (metrics.sample callable by the group) and **L4** (shared 50 MiB cap) to the backlog —
say so in the PR. Verify: typecheck, lint, `bun run test`, `build:agent`, `build:cli`; run
`security-review` on your slot's diff. Changeset: patch — "Seguridad: un sitio parado sigue
parado y los proyectos no pueden tomar bases ajenas."
