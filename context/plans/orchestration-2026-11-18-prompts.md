# Orchestration of 2026-11-18 — prompts per unit (wave 1)

Shared brief: `C:\Users\Cesar\Documents\Work\kit-deploy\context\plans\orchestration-2026-11-18.md`.

---

## W1 — `feat/panel-select`

You are worker **W1**. Branch: `feat/panel-select`. Decisions: **D053**. CONTENT_CHECKLIST rows:
none. Model · effort: **sonnet · medium**. Docker: **no**. Local build: **no**. Test services: **no**.

First read the shared brief. Earlier decisions: D039 (Dominios host picked by a select) — `cat
context/decisions/D039-*.md`.

### What César asks
> "no hay custom select sino el select es el nativo"

### Where it is
- `components/ui/native-select.tsx` — shadcn NativeSelect on our tokens (the only select primitive).
- Users: `app/(panel)/new/new-project-form.tsx:198`, `app/(panel)/settings/token-controls.tsx:148`,
  `app/(panel)/p/[project]/logs/page.tsx:92,103,127` (a `method="get"` form: three selects with
  `name=`), plus two raw `<select>`: `app/(panel)/p/[project]/domains/domains-manager.tsx:360` and
  `components/panel/deployment-filters.tsx:70`.
- `app/(panel)/dev/componentes/gallery.tsx` — the component gallery: add the new Select there.

### Approach decided
- Add `components/ui/select.tsx`: shadcn/ui Select (new-york) built on `radix-ui` (already a
  dependency; import from `radix-ui`, as the other `components/ui/*` do). Check the shadcn source
  through Context7. Same box as `Input` / the current NativeSelect (`min-h-control`, `rounded-md`,
  `border-input`, `bg-card`, focus ring classes) — copy them from `native-select.tsx`, no new values.
  Popover content: `bg-popover`/`border` tokens that already exist (check `globals.css`); if one is
  missing, use the nearest and list it under "Missing tokens".
- Replace **every** use above. Radix Select renders a hidden native select when given `name`, so
  the logs GET form and server-action forms keep submitting; verify that in a unit test or by
  reading the rendered markup in a test, not by assumption. A select whose change navigates
  (`deployment-filters`) keeps its current behavior.
- Empty-string values: Radix Select forbids `value=""` on an item. Logs' "level" has a `""` option
  (`LEVEL_OPTIONS`): map it to a sentinel (e.g. `"all"`) and translate back where the value is read
  (`parseLogFilter`), with a test.
- Keep `native-select.tsx` (do not delete it); if nothing imports it any more, say so in the PR.

### Known traps
- `Field` passes `id`, `aria-describedby`, `aria-invalid` through `a11y` — they must land on the
  Radix **Trigger** so the `<label for>` still names it. Test that the label names the control.
- 320 px: the trigger must not force horizontal scroll (min-w-0, truncate the value).
- `tests/unit/*` may snapshot or grep the select markup: run `bun run test:related`.

### How to verify
- Unit tests for the value mapping and the hidden-input `name` submission.
- `a11y` skill on the changed screens (keyboard: open with Enter/Space/arrows, Esc closes, focus
  returns to the trigger; visible focus; not color only).

### Closing
Changeset: patch — "Los selectores del panel usan un menú propio en lugar del nativo del navegador."
In the PR, "Decisión tomada / alternativa" for: native vs custom on phones (Radix's own menu).

---

## W2 — `feat/panel-icons-meta`

You are worker **W2**. Branch: `feat/panel-icons-meta`. Decisions: **D054**. CONTENT_CHECKLIST
row: **40**. Model · effort: **sonnet · low**. Docker: **no**. Local build: **yes** (to see the
generated icon/OG routes in `next build`'s output). Test services: **no**.

### What César asks
> "no veo tratamiento de seo (favicon, og image...)"

The site is private and stays `noindex` (CLAUDE.md: `seo` N/A) — this is **identity**, not
ranking: a real favicon/app icon, Open Graph/Twitter image and base metadata so a shared link to
deploy.fockus.dev shows a proper card.

### Where it is
- `app/layout.tsx:16-21` — `metadata` (title template, description, `robots` noindex). Keep robots.
- `app/favicon.ico` — Next's default; `public/` has the create-next-app leftovers (`file.svg`,
  `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`): check whether anything imports them; **do
  not delete** — list them in the PR as unused.

### Approach decided
- Next 16 file conventions (read `node_modules/next/dist/docs/` › metadata files): `app/icon.svg`
  (or `icon.tsx`), `app/apple-icon.tsx`, `app/opengraph-image.tsx` (+ `twitter-image` if it is not
  inherited), `metadataBase` from the dashboard host the code already uses (grep `DASHBOARD_HOST`),
  `applicationName`, `openGraph` (siteName "kit-deploy", locale `es`), `themeColor` via `viewport`
  in light and dark from the tokens.
- The mark: the conservative option — a monogram/glyph built from the existing tokens (primary on
  background), no new brand colors. In the PR, the alternative you discarded. `ImageResponse` cannot
  read CSS variables: take the token values from `context/COLORS.md` and cite each one in a comment
  next to its use (the token-value test may forbid hex in `app/` — check `tests/unit/` for a
  tokens test first and follow what it allows; if it forbids hex, put the values in a small
  `lib/brand.ts` that reads them from one place and say so).
- OG copy (title/subtitle on the image) is new copy → CONTENT_CHECKLIST row 40 (send the row text
  in your report; you cannot write the local file).

### How to verify
- `next build` lists `/icon`, `/apple-icon`, `/opengraph-image`; open each built route once with
  `node` + Playwright or `curl` against `bun run start` on your port and attach the PNGs to the PR.
- `X-Robots-Tag` and `robots` still noindex.

### Closing
Changeset: patch — "El panel tiene ícono propio e imagen para compartir enlaces."

---

## W3 — `feat/passkey-remove`

You are worker **W3**. Branch: `feat/passkey-remove`. Decisions: **D055–D056**. CONTENT_CHECKLIST
rows: **41–42**. Model · effort: **opus · medium**. Docker: **no**. Local build: **no**. Test
services: **no**.

Earlier decisions: D003 (passkey-first public dashboard), D041 (new passkey only by enrol link;
Ajustes read-only; `ENROL_ONLY`), D033 (confirmations). `cat` each.

### What César asks
> "Veo que no puedo revocar, eliminar passkeys"

César chose: **remove from Ajustes, re-confirmed with a fresh TOTP code**; never the last way in.

### Where it is
- `app/(panel)/settings/tables.tsx:16-60` — passkeys table (read-only).
- `lib/panel/data/store.ts:88,203` — `passkeys(userId)` read.
- `lib/auth/handler.ts:20-43,81-108` — allowed Better Auth routes and `ENROL_ONLY`.
- `lib/auth/client.ts:41` and `lib/auth/messages.ts:96-107` — TOTP helpers and messages.
- Server actions live in `app/(panel)/actions/*.ts` (pattern to copy: confirm + audit row).

### Approach decided (you design the details)
- A "Eliminar" per row → a confirmation (`AlertDialog`, existing D033 pattern) that asks for a
  6-digit TOTP code. The **server** verifies the code against the signed-in user's TOTP (Better
  Auth's two-factor verification, or its TOTP primitive server-side — check its API with Context7
  for the installed version; do **not** open a new public Better Auth route through the handler
  just for this) and only then deletes that passkey **of that user** (id + userId in the WHERE).
- Refuse when it is the user's only passkey **and** the user has no TOTP enabled — in practice
  TOTP is required, so the rule is: TOTP verified → removal allowed, even of the last passkey (the
  account still has TOTP + recovery codes + CLI enrol). Write the rule in D055 with why.
- Audit row for the removal (no secret, the passkey's name/id only). Rate-limit or at least log
  failed codes the same way sign-in failures are logged (`kit-deploy-auth: failed …` line, so the
  future fail2ban jail sees it).
- If the passkey being removed is the one that opened the current session, the session stays
  (sessions are not tied to a credential) — say so in D056 or the PR.
- Copy (dialog title, help, errors, success notice) → rows 41–42 in your report.

### Known traps
- A stolen dashboard session must not be enough: the TOTP check is the point. Unit-test: wrong
  code → nothing deleted; another user's passkey id → nothing deleted; replayed code (same 30 s
  window, if the library prevents reuse say so; if not, document it).
- Do not touch the Auditoría section of `settings/page.tsx` (wave 2) nor `token-controls.tsx` (W1).

### How to verify
- Unit tests with `tests/unit/auth-fakes.ts`. `a11y` on the dialog. `security-review` skill on the
  branch before the PR (this is an auth change).

### Closing
Changeset: minor — "Ahora puedes eliminar una passkey desde Ajustes, confirmando con tu código TOTP."

---

## W4 — `fix/project-page-polish`

You are worker **W4**. Branch: `fix/project-page-polish`. Decisions: **D057–D058**. CONTENT_CHECKLIST
rows: none. Model · effort: **sonnet · medium**. Docker: **no**. Local build: **no**. Test services: **no**.

Earlier decisions: D043 (panel headings and states) — `cat context/decisions/D043-*.md`.

### What César asks
> "Los tabs en proyecto tiene un mini scroll vertical el cual no tiene sentido"
> "en el card despliegues recientes y previews activos cuando ambos están vacíos deberían tener la misma altura"
> "Mejora cómo se ve la info en la tabla variables, el textarea no tiene autoresize al agregar más líneas"

### Where it is
- `components/layout/project-tabs.tsx:35` — `<ul className="flex overflow-x-auto">`; the links have
  `-mb-px` (line 28). Cause (verified by reading): `overflow-x: auto` makes `overflow-y` compute to
  `auto` too, and the 1 px negative margin overflows vertically → a tiny vertical scrollbar. Fix it
  without losing the narrow-screen horizontal scroll (e.g. `overflow-y-hidden` plus keeping the
  underline visible — measure that the active underline is not clipped).
- `app/(panel)/p/[project]/page.tsx:127-157` — the two Sections side by side in a `flex flex-wrap`;
  each one's empty state has its own height. When they sit on one row, both cards stretch to the
  same height (and their empty states center in it); when wrapped, each its own height.
  `components/panel/deployments-table.tsx:150-173`, `components/panel/preview-cards.tsx`.
- `app/(panel)/p/[project]/env/env-manager.tsx:97` (columns) and `:344` (DataTable), textarea at
  `:443-466`; `components/kit/field.tsx:127-143` (`FieldTextarea`), `components/ui/textarea.tsx`.

### Approach decided
- Variables table: you decide the improvement conservatively (name in mono with weight, value
  column truncated with the full value available via title/expansion for plain values, secrets stay
  `••••` — never the value, D033; environment/type as badges not color-only; actions aligned).
  Explain before/after with screenshots in the PR.
- Autoresize: `field-sizing: content` with a JS fallback for browsers without it (check support in
  the installed Tailwind — `field-sizing-content` class — and on Firefox), with a max height after
  which it scrolls. Put it in `components/ui/textarea.tsx` or `FieldTextarea` so every textarea
  gets it; the gallery (`app/(panel)/dev/componentes/gallery.tsx`) shows it.

### Known traps
- `tokens.test`-style tests may forbid raw values in `app/`: run `bun run test:related`.
- No horizontal page scroll at 320 px after the table change.

### How to verify
- Measure with Playwright (node, `.qa/`) against a static render or the component gallery if you
  can run without a server; if not, unit tests + reasoning, and the measurement goes to the QA list
  in your report. `a11y` skill.

### Closing
Changeset: patch — "Pestañas del proyecto sin barra vertical, tarjetas del resumen a la misma altura y una tabla de variables más legible."

---

## W5 — `feat/project-remove`

You are worker **W5**. Branch: `feat/project-remove`. Decisions: **D059–D060**. CONTENT_CHECKLIST
row: **43**. Model · effort: **opus · medium**. Docker: **no**. Local build: **no**. Test services: **no**.

Earlier decisions: D011 (agent's closed list of ops), D016 (127.0.0.1), D051 (reserved names and
owned databases) — `cat` each.

### What César asks
> "kd_hello sigue en pie, ¿se seguirá necesitando? por mí borrarlo para que no ocupe más nada"

There is no `project rm` today (`cli/commands.ts:100-160` usage). Build it so kd_hello (and any
future project) is removed the platform's way, not by hand on the VPS.

### Approach decided
- `kit-deploy project rm <project> [--yes]` (root, like `project pin`): without `--yes` it prints
  what it would remove and exits 0; with `--yes` it does it. New agent op `project.remove`
  (append at the end of `agent/protocol.ts`'s `Request` union; implementation in
  `agent/project-remove.ts`; one `case` in `agent/ops.ts`).
- Removes: every container/deployment kit-deploy created for that project (prod + `pr-<n>`
  previews), its images kept for rollback, its Caddy site files (then reload Caddy), its cron jobs,
  domains, env vars, tokens, alerts state and the project rows — in an order that never leaves Caddy
  pointing at a dead upstream for another project. Only resources the database says kit-deploy
  created (CLAUDE.md: never `docker rm` what kit-deploy did not create).
- **Keeps the databases** `<p>` / `<p>_preview` (CLAUDE.md: no `kit-db drop`) and prints the exact
  manual command for César to drop them if he wants. Keeps the master key untouched.
- Audit row. Idempotent: running it twice is not an error.
- Copy of the CLI output is English (CLAUDE.md); row 43 only if the dashboard ever shows it (it
  does not now: then no row, say so).

### Known traps
- `infra/test/install-in-container.sh` and `previews-in-container.sh` use kd_hello as the fixture:
  do not break them; if `project rm` deserves a step in the install test, add it at the end, but
  you do not run Docker (`Docker: no`) — the orchestrator runs `bun run test:infra:install` once.
- Fakes: `tests/unit/agent-fakes.ts` (append new `Deps` methods at the end).

### How to verify
- Unit tests of the plan (dry-run listing), the order, idempotence and "only what we created".
- `security-review` skill (new agent operation).

### Closing
Changeset: minor — "Nuevo comando `kit-deploy project rm` para quitar un proyecto de la plataforma (las bases de datos se conservan)."
Manual action for César: none in the PR; the orchestrator runs it on kd_hello on the VPS after the
ship, with César's OK.

---

# Wave 2 (written 2026-11-18 on main @ f2209d9)

## W6 — `feat/repo-picker`

You are worker **W6**. Branch: `feat/repo-picker`. Decisions: **D061–D062**. CONTENT_CHECKLIST
rows: **44–45**. Migration: **none** (nothing is stored). Changeset: **minor**. Model · effort:
**opus · medium**. Docker: **yes** (only for `bun run test:infra:install`, once, at the end; no
other Docker). Local build: **no**. Test services: **no**. Dev server: **no**.

Earlier decisions: D011 (web never touches Docker / master key), D053 (W1's Select) — `cat` them.
Wave 1 is merged: `components/ui/select.tsx` and `components/kit/option-select.tsx` exist — match
their trigger/popup styles (same tokens) for the combobox.

### What César asks
> Que el campo "Repositorio" de Nuevo proyecto sea una lista buscable de mis repos, como en Vercel.
> La lista sale de un segundo token fine-grained de GitHub de solo lectura (All repositories +
> Metadata: read) que yo escribo en el VPS; mientras no exista, el campo sigue aceptando
> `owner/repo` a mano.

### Where the code is
- Form: `app/(panel)/new/new-project-form.tsx` (client; "Repositorio" `FieldInput` at :164-176,
  `EMPTY` at :40, `MAX.repo` from `lib/panel/schemas.ts`). Page (server): `app/(panel)/new/page.tsx`.
- GitHub client: `lib/deploy/github.ts` (`githubRequest(token, opts)`, `GITHUB_API`,
  `githubTokenFromEnv` :81 reads `GITHUB_STATUS_TOKEN`). Its header rule: the token only goes in
  the Authorization header; errors carry the HTTP status, never the body. Reuse it.
- How the status token reaches the web: `infra/install.sh` :17-19 and :99-118 (`--github-token`,
  stdin, `github_pat_*|ghp_*` check, `printf` builtin, 0600 root, tmp + mv),
  `infra/update.sh` :243-245 (`--env-file $STATE/github.env` if present), `scripts/ship.sh`
  (passes install.sh options through; usage at :4-9), the install test
  `infra/test/install-in-container.sh` :200-215 (checks for github.env).

### Approach decided
- **Separate file, not the status token's**: `install.sh --github-read-token` writes
  `/etc/kit-deploy/github-read.env` with `GITHUB_READ_TOKEN=` — same checks and same writing
  pattern as `--github-token` (copy that block; it must not touch `github.env`, which
  `--github-token` rewrites whole). `update.sh` adds `--env-file $STATE/github-read.env` when it
  exists. Only the web reads it; the CLI does not need it. Document both in their headers;
  `ship.sh`'s usage lines get the new flag.
- `lib/github/repos.ts` (or next to `lib/deploy/github.ts`): `listRepos(token, opts)` →
  `GET /user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member`,
  following the `Link: rel="next"` header up to a cap (5 pages / 500 repos), returning only
  `{ fullName, private, pushedAt, defaultBranch }`. Cache in module memory for 5 minutes; a
  failure is not cached. Token missing → `{ kind: "no-token" }`; error → `{ kind: "error", status }`;
  it never throws to the page, never logs the token or the response body.
- The server page reads the list and passes **only those fields** to the form (no API route; the
  token never reaches the client). `/new` becomes dynamic: check the Next 16 docs in
  `node_modules/next/dist/docs/` for the right way (connection() / dynamic rendering) first.
- Combobox: shadcn `popover` + `command` (adds `cmdk`; written as shadcn new-york writes them, on
  the `radix-ui` package already installed — Context7 for cmdk's current API). New primitives:
  `components/ui/popover.tsx`, `components/ui/command.tsx`; the composed field in
  `components/kit/repo-combobox.tsx`. Search filters by `owner/repo`; private repos show a
  "Privado" badge (text, not color only); keyboard: open with Enter/↓, type to filter, Enter
  picks, Esc closes; the value lands in the same `repo` form field. Picking a repo also sets
  "Rama" to its default branch if the user has not edited that field.
- **Free text always works**: the combobox lets you use an `owner/repo` that is not in the list
  (a "Usar «owner/repo»" item), and with `no-token` or `error` the field is today's plain
  `FieldInput` plus one muted hint (row 44: no token configured; row 45: the list could not be
  loaded — both end in "Escribe owner/repo"). The value's validation stays the server's
  (`lib/panel/schemas.ts`), unchanged.
- D061: the read token and its file; D062: the combobox and the no-token fallback.

### Known traps
- `update.sh` passes `github.env` as a whole file and `--github-token` rewrites it: a new key put
  there would be lost. Hence the separate file.
- `grep -rn "github.env\|github-token" tests/ infra/test/` before editing; keep those green.
- No DOM test environment here (`bun:test`, no happy-dom): unit-test `listRepos` (pagination by
  Link, cap, cache, failure not cached, 401/403/timeout, no-token, the token only in the header —
  fake `fetch` like the commit-status tests) and the pure filter/mapping. The UI is verified by
  the a11y gate and the batch QA after the wave (it runs `qa:local`, with no token: the fallback).
- `bun add cmdk` only; no other new dependency.

### How to verify
- `bun run test:related`, then build / typecheck / lint / test.
- `bun run test:infra:install` once (Docker): add checks for `--github-read-token` (0600 root,
  key name, a refused value keeps the old file, the web gets it as an env-file, cesar cannot read it,
  `github.env` untouched).
- `a11y` skill (combobox: role=combobox, aria-expanded, listbox/options, visible focus) and
  `security-review` through a subagent over `git diff origin/main...HEAD` of your slot (new secret).

### Closing
Changeset: minor — "Nuevo proyecto: el campo Repositorio busca entre tus repos de GitHub (con un token de solo lectura); sin el token se sigue escribiendo owner/repo."
Manual action for César (PR body): create the fine-grained token (Repository access: All
repositories; Repository permissions › Metadata: Read-only; nothing else) and write it with
`bash scripts/ship.sh build/kit-deploy-<sha>.tgz --install --github-read-token` (stdin) at the
batch ship. Report rows 44–45's copy for the orchestrator to add to CONTENT_CHECKLIST.

## W7 — `fix/panel-laptop-audit`

You are worker **W7**. Branch: `fix/panel-laptop-audit`. Decision: **D063**. CONTENT_CHECKLIST
rows: **none**. Migration: **none**. Changeset: **patch**. Model · effort: **sonnet · medium**.
Docker: **yes** (only for `bun run qa:local -- --port <your port>`: Postgres in Docker with the
`.env.test.local` accounts; never the real database). Local build: **no**. Test services: **no**.
Dev server: **yes, only through `qa:local` on your slot's port** (César authorizes it for this unit).

Earlier decisions: D042 (Auditoría paging by link) — `cat` it; this unit supersedes its "50 +
Cargar más" part (say so in D063 and mark D042 "Superseded in part by D063").

### What César asks
> En la laptop (1280–1536) hay páginas que dejan espacio sin usar. Y Auditoría: 20 filas y
> paginación real (Anterior / Siguiente), no 50 + "Cargar más".

### Where the code is
- Shell: `components/layout/panel-shell.tsx:13` (`max-w-content` = 1440px, `app/globals.css:126`).
  Narrow containers: `app/(panel)/new/page.tsx:8` (`max-w-form-wide`, a form: keep it),
  `app/(panel)/p/[project]/domains/page.tsx:17` and `env/page.tsx:18` (`max-w-3xl`),
  `components/cron/cron-tables.tsx:147` (`max-w-xl`), `components/databases/databases-table.tsx:59`
  and `cron-tables.tsx:120` (`max-w-prose`, text — likely fine). Grids:
  `grep -rn "grid-cols" "app/(panel)" components`.
- Audit: `AUDIT_PAGE` `lib/panel/data/store.ts:68`, `audit(opts)` in that file (cursor `before`),
  `auditNext` `lib/panel/data/resources.ts:302`, the section and its "Cargar más" link in
  `app/(panel)/settings/page.tsx` (~:230-265), the `?antes=` parsing in `settingsData`.

### Approach decided
- (a) Measure first: with `qa:local` up, a Playwright script in `.qa/` (run with `node`) visits
  every panel route logged in (`scripts/qa-session.ts` / `qa-roles.ts` show how QA signs in;
  routes: `/`, `/new`, `/settings`, and every tab under `/p/<seeded project>/…`) at 1280, 1366,
  1440 and 1536 × 800, and records per route the main content's width vs the viewport and any
  grid that stays 1-column. Fix the class where a page leaves > ~30 % unused for no reason
  (tables and lists may widen; a single form stays at its form width — that is the HANDOFF, not
  waste). Existing tokens / Tailwind scale only; a needed container token goes in "Missing
  tokens" of your report instead of a magic value. Re-run after: the before/after table goes in
  the PR. Check 320 px still has no horizontal scroll.
- (b) Audit: `AUDIT_PAGE = 20`; `?pagina=N` (1-based; invalid → 1, past the last → last) with
  `offset` + a `count()` for the total; `Anterior` / `Siguiente` links (at the ends: plain text
  with `aria-disabled`, not a link — not by color only) and "Página N de M" between them, inside a
  `nav aria-label="Paginación de auditoría"`, `#auditoria` anchor kept. Old `?antes=` links land
  on page 1. Still link-based, no client state (like D042). Update the store interface, its
  Drizzle implementation and the fakes; tests for the page math (empty, exactly 20, 21, last
  page, out of range, garbage) and the store's offset/limit.

### Known traps
- Do not touch `components/ui/*`, `components/kit/option-select.tsx`, nor
  `app/(panel)/new/new-project-form.tsx` (W6's). Leave `app/(panel)/new/page.tsx` as it is.
- Machine load: two workers run; one `qa:local`, one browser tab; stop the server when done.
- No DOM test env: layout is verified by the measuring script, not by unit tests.

### How to verify
- `bun run test:related`, then build / typecheck / lint / test.
- The measuring script's before/after; `a11y` skill over the pagination and every changed page.
- `bun run shots` for /settings (Auditoría) and one widened page, then `shots:publish`.

### Closing
Changeset: patch — "Panel: las páginas aprovechan el ancho en laptop y Auditoría pagina de 20 en 20 con Anterior/Siguiente."
Manual action for César: none.

---

# QA fixes (2026-11-19, on main @ 599afcc)

## W8 — `fix/panel-reflow-qa`

You are worker **W8**. Branch: `fix/panel-reflow-qa`. Decision: **D064** only if you change a rule
(probably none: say so). CONTENT_CHECKLIST rows: none. Migration: none. Changeset: **patch**.
Model · effort: **sonnet · medium**. Docker: **yes** (only `bun run qa:local -- --port 4302 --preview`,
Postgres in Docker; never the real DB). Local build: **yes** (that preview). Test services: no.

### What to fix — the two Altos of the batch's design QA
Report: `C:\Users\Cesar\Documents\Work\kit-deploy\context\plans\qa-batch-2026-11-18-design.md`
§ Hallazgos, the two `[Alto]` entries (read both whole). The reproduction scripts are already in
your slot: `.qa/repro/1-word-break.mjs` and `.qa/repro/4-notice-font200.mjs` (they FAILed on main
@ 599afcc; copies in `context/plans/qa-batch-2026-11-18-design/repro/`).

1. **Tables break words letter by letter on mobile**: `components/kit/data-table.tsx:115` puts
   `[overflow-wrap:anywhere]` on every `td`. Fix the **class**, not the listed tables: every table
   built on DataTable and any other `<table>` in `app/` / `components/`
   (`grep -rn "overflow-wrap:anywhere\|<table" components app`). Short tokens (status chips, SHAs,
   environment, type, dates, `••••`) never wrap (`whitespace-nowrap`); the table gets a min width
   so its wrapper scrolls horizontally (check the wrapper has overflow-x); `anywhere` stays only on
   free-text columns (domain, detail, error) — give DataTable a per-column option if it has none.
   The measured guard decides, not the grep.
2. **Notice overflows at 200 % browser font (390 px)**: `min-w-48` in `components/kit/notice.tsx:59`
   and `app/(panel)/settings/page.tsx:150`, `:195`. Sweep every rem `min-w-<n>` inside a flex row
   in `components/` and `app/` that can exceed the viewport at a 32 px base font: `min-w-0`
   (flex-wrap already wraps) or a token. No magic values.

### How to verify
- Sign in like the QA did (its scripts in this slot's `.qa/` show how; `.env.test.local`, never print values).
- Both repro scripts PASS on your branch; in the PR, main's FAIL (from the QA report) and your PASS outputs.
- Leave two guards versioned next to `scripts/qa/panel-reflow.mjs`: `scripts/qa/table-word-break.mjs`
  and `scripts/qa/font-200-reflow.mjs`, each taking the base URL.
- `scripts/qa/panel-reflow.mjs` still 0 overflows; `a11y` skill; `bun run test:related`, typecheck, lint, test.
- `bun run shots` of /p/<p>/deployments at 390 (empty `.pr-shots/` first), then `shots:publish`.
- Stop the server when done. A functional-qa may be running on port 4301 / wt1: leave it alone.

### Closing
Changeset: patch — "Panel: las tablas ya no parten palabras en el móvil y los avisos no desbordan con la fuente del navegador grande."
Manual action for César: none.

## W9 — `fix/select-form-reset`

You are worker **W9**. Branch: `fix/select-form-reset`. Decision: **D064** (how a select keeps its
value across a rejected Server Action). CONTENT_CHECKLIST rows: none. Migration: none. Changeset:
**patch**. Model · effort: **opus · medium** (a token silently minted for the wrong project).
Docker: **yes** (only `bun run qa:local -- --port 4301 --preview`). Local build: **yes** (that preview).

### What to fix — the Alto of the batch's functional QA
Report: `C:\Users\Cesar\Documents\Work\kit-deploy\context\plans\qa-batch-2026-11-18-functional.md`,
the `Alto` entry (read it whole). A select inside a `<form action={…}>` with `useActionState`
returns to its first value after the server rejects a submit: Nuevo proyecto saves 512 MB when
1024 was chosen; Ajustes › Nuevo token mints the token for another project. Cause found by QA:
React runs `form.reset()` after the action and Radix Select (2.4.1) listens to that reset and
overwrites the controlled state. Code: `components/kit/option-select.tsx` (W1, D053),
`components/ui/select.tsx`; users: `grep -rn "OptionSelect\|<Select" app components`.

Fix the **class**: every select in a form with a Server Action keeps the chosen value after a
rejected submit and submits what is shown. Pick the approach after checking the installed Radix
and React 19 behaviour (Context7 + `node_modules`): e.g. the component re-applies its value on the
form's `reset` event, or the forms keep their values and pass them back as `defaultValue`/key —
whichever keeps one place for the rule. Check the other inputs of those forms keep their values
too (they did in QA: say so). The repo combobox (W6) uses a hidden input — check it the same way.

### How to verify
- The repro and its helpers are already in your slot's `.qa/` (`repro/2-select-vuelve-al-inicial.mjs`,
  `lib.mjs`, `np-common.mjs`, `pk-common.mjs`, `setup-accounts.mjs`; the QA account's secrets in
  `.qa/secrets.json`, gitignored, never print it). Run from the slot root:
  `node --env-file=.env.test.local .qa/repro/2-select-vuelve-al-inicial.mjs http://localhost:4301`.
  On main @ 599afcc it printed `FAIL memoria: … saved=512MB (chosen 1024); token: minted for "b1"
  (chosen maranatha)`; on your branch it must PASS. Both outputs in the PR. If the fresh DB needs
  the accounts, run `.qa/setup-accounts.mjs` first.
- Version the guard as `scripts/qa/select-after-rejected-submit.mjs` (base URL argument).
- `a11y` skill; `bun run test:related`, typecheck, `bunx biome check <every file you touched or added>`, test.
- Stop the server by PID (`netstat -ano | grep :4301`, `taskkill /T /F /PID <pid>`).

### Closing
Changeset: patch — "Panel: los selects conservan lo elegido cuando el servidor rechaza el formulario (antes el token podía salir para otro proyecto)."
Manual action for César: none.
