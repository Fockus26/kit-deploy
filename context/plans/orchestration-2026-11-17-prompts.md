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
