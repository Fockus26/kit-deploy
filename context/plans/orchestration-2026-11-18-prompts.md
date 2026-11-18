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
