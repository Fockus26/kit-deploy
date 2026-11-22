# Orchestration of 2026-11-22 — unit prompts

## W1 — `feat/backup-codes-totp`

You are worker **W1**. Branch: `feat/backup-codes-totp`. Slot and port: the ones in the message
that launches you. Decisions: range **D067–D068**. CONTENT_CHECKLIST rows: **46–48**.
Model · effort: **opus · medium**. Docker: **no**. Local build: **no**. Test services: **no**.

First read the shared brief: `C:\Users\Cesar\Documents\Work\kit-deploy\context\plans\orchestration-2026-11-22.md`
(it fixes the shared file `lib/panel/totp-guard.ts`, byte for byte).
Earlier decisions that constrain you: D003 (passkey + TOTP, no password), D055 (passkey removal
needs a fresh TOTP, the guard), D056, D041 (a stolen cookie must not strip factors) —
`cat context/decisions/D0NN-*.md` for each.

### What César asks
> "No puedo volver a generar los codigos de recuperacion o verlos, deberia poder verlos y colocar
> una contraseña para poder verlos de nuevo"

There is no password (D003). César chose (2026-11-22) the authenticator app's current 6-digit
code instead: "Sí, con el código".

### Where it is
- `app/(panel)/settings/page.tsx:115-128` — the "Códigos de recuperación" card: a badge and a
  sentence, no action.
- `app/(panel)/settings/passkey-controls.tsx` + `lib/panel/actions/passkeys.ts` +
  `lib/panel/passkey-runtime.ts` — Eliminar passkey with a TOTP dialog: **the pattern to copy**
  (order of checks, guard, `failedLine`, audit in one transaction, result shape, no code in any
  result/message/log).
- `lib/auth/totp-check.ts` — `betterAuthTotp` (server-side `auth.api.verifyTOTP`) and
  `memoryTotpGuard`.
- `lib/auth/config.ts:95-101` — `twoFactor({ allowPasswordless: true, backupCodeOptions:
  { amount: 10, length: 12 } })`. Check in `node_modules/better-auth` (1.7.23) how
  `storeBackupCodes` defaults and that `getBackupCodes`/`viewBackupCodes` decrypts it.
- `node_modules/better-auth/dist/plugins/two-factor/backup-codes/index.mjs:256-345` —
  `generateBackupCodes` (session + `allowPasswordless` → no password needed; returns the new
  plain codes, stores them encrypted, the old ones stop working) and `viewBackupCodes`
  (`createAuthEndpoint.serverOnly`, body `{ userId }`).
- `app/enrol/enrol-flow.tsx:60-80, 460-500` — how the codes are shown and downloaded at enrolment
  (list with aria-label, "Descargar .txt", copy). Reuse its presentation (extract a small shared
  component if it fits; do not change the enrol flow's behaviour).
- `lib/db/schema.ts:291-310` `AUDIT_ACTIONS`, `drizzle/0016_passkey_audit.sql` — the check
  constraint pattern; `lib/db/account-scope.ts` — project `-` for account actions.

### Approach decided
- Card gets two actions: **"Ver códigos"** and **"Generar nuevos"**, each opening a dialog that
  asks for the current 6-digit code. Both are Server Actions (no new route through
  `lib/auth/handler.ts`), checking in order: session → form (exactly 6 digits) →
  `two_factor_enabled` (off → refused) → `panelTotpGuard` → `verifyTotp` → only then the call.
- View: `auth.api.viewBackupCodes({ body: { userId: session user id } })` → the **remaining**
  unused codes. Generate: `auth.api.generateBackupCodes` with the request's headers → the 10 new
  ones; the dialog says first that the old ones stop working.
- The codes travel only in the action's result (the form's action state, like a new deploy token,
  D041) — never in a URL, cookie, cache, log or audit row. Shown once in the dialog with Copiar /
  Descargar .txt; closing the dialog forgets them.
- Audit rows `backup_codes.view` and `backup_codes.regenerate` (project `-`), migration
  `0017_backup_codes_audit` (only the check constraint, like 0016) + `AUDIT_ACTIONS`; the
  regenerate audit in the same transaction as far as Better Auth allows — if it cannot be (it
  writes through its adapter), write the audit right after and document it in D067.
- Use `panelTotpGuard` from `lib/panel/totp-guard.ts` (create it exactly as the brief says) and
  switch `lib/panel/passkey-runtime.ts` to it.
- `failedLine` path `/panel/backup-codes`.
- Visual details (button variants, placement): conservative, following the passkey card;
  "Decision taken / alternative" in the PR.

### Known traps
- `verifyTOTP` server-side has no rate limit, no lockout and no used-code memory — hence the guard
  (D055); a code spent on a passkey removal must be refused here within 2 min (shared guard).
- Better Auth's `APIError` exists in two copies: use `statusOf`-style checks, not `instanceof`.
- Do not show codes when `viewBackupCodes` returns none: say there are no codes left and offer
  Generar nuevos.
- Tests: `tests/unit/passkey-remove.test.ts` is the model; write `tests/unit/backup-codes.test.ts`
  with the same fakes (wrong code, blocked, reused, TOTP off, no session, success → audit row, the
  code never appears in the result).

### How to verify
- typecheck, lint, `bun run test:related`, then the full suite alone.
- a11y skill on the code (dialog focus, labels, the code list's name, errors announced).
- `security-review` on `.qa/review.diff`.

### Closing
Changeset: **minor** — "Ajustes: puedes ver tus códigos de recuperación o generar nuevos
confirmando con el código de tu app de autenticación." Copy is provisional (rows 46–48).
Decisions: D067 (view/regenerate behind fresh TOTP, codes only in action state, audit), D068 only
if needed (e.g. the shared guard). Manual actions: migration 0017 applies at the next ship.

---

## W2 — `feat/panel-project-remove`

You are worker **W2**. Branch: `feat/panel-project-remove`. Slot and port: the ones in the message
that launches you. Decisions: range **D069–D070**. CONTENT_CHECKLIST rows: **49–51**.
Model · effort: **opus · medium**. Docker: **no**. Local build: **no**. Test services: **no**.

First read the shared brief: `C:\Users\Cesar\Documents\Work\kit-deploy\context\plans\orchestration-2026-11-22.md`
(it fixes the shared file `lib/panel/totp-guard.ts`, byte for byte; you do **not** touch
`lib/panel/passkey-runtime.ts`, `lib/db/schema.ts` or `drizzle/`).
Earlier decisions that constrain you: D059 (`project rm`: rows first, then kit-agent
`project.remove`; DBs kept), D055 (fresh TOTP + guard), D011 (web talks to the agent only through
its closed op list), D051 (the database is the web's to write) — `cat context/decisions/D0NN-*.md`.

### What César asks
> "No puedo eliminar un proyecto estoy intentando eliminar kd_hello pero solo puedo pararlo mas
> no borrarlo"

### Where it is
- `cli/project-commands.ts:104-200` — `projectRmCommand`: the exact sequence to reproduce
  (assertProject, refuse `_preview`, footprint, rows first via `store.remove(project, audit)`, then
  `client.call("project.remove", { project, dryRun:false })`, `store.record(audit)` when only
  machine leftovers, `failed[]` → partial). Extract the shared logic into a pure function both the
  CLI and the panel call, instead of duplicating it, if it stays small; the CLI's output must not
  change (its tests guard it).
- `lib/db/project-remove.ts` — `drizzleProjectRemovalStore`, `ProjectFootprint`.
- `agent/protocol.ts:220` / `agent/ops.ts:344` — `project.remove` op, already reachable from the
  socket (no agent change needed; confirm the web's agent client can call it —
  `lib/ops/agent`).
- `components/panel/project-actions.tsx` (Parar/Reiniciar with `ConfirmDialog`) and
  `components/kit/confirm-dialog.tsx` (`confirmName`: type the name to enable a destructive
  confirm) — where the new action lives and the dialog to extend.
- `lib/panel/actions/deployments.ts:221` `stopProject`, `lib/panel/actions/passkeys.ts` — action
  patterns (deps injection, session, audit, TOTP order).
- `app/(panel)/p/[project]/layout.tsx` — the project header.

### Approach decided
- **"Eliminar proyecto"** (destructive) next to the project's other actions. Dialog: what goes
  (the footprint: deployments, previews, hosts, variables, tokens, cron jobs — counts and names,
  never values) and what stays (**its databases** `<p>` and `<p>_preview`, the audit log), then
  the project name typed (`confirmName`) **and** the current 6-digit TOTP code. Submit enabled
  only with both.
- Server Action order: session → form (name equals the route's project; 6 digits) →
  `two_factor_enabled` (off → refused) → `panelTotpGuard` → `verifyTotp` → the D059 sequence.
  Audit `project.remove` with actor = the panel user (same convention as other panel actions).
- Success → redirect to Inicio with a notice "kd_hello eliminado…"; partial (`failed[]` or agent
  unreachable after the rows went) → a clear notice that the rows are gone and what is left, and
  that "Eliminar" again (or `kit-deploy project rm <p> --yes`) finishes it — so the dialog must
  also work when the project row is already gone but machine leftovers remain? Only if reachable
  from the UI; otherwise point to the CLI in the notice.
- Create `lib/panel/totp-guard.ts` exactly as the brief says and use `panelTotpGuard`.
- `failedLine` path `/panel/project-remove`.
- Visual details: conservative, like Parar; "Decision taken / alternative" in the PR.

### Known traps
- The rows go **first** (D059 explains why); never the reverse.
- Never a project named `kit_deploy`/reserved or `*_preview`: `assertProject` + the `_preview`
  check, server-side.
- The databases are never dropped — say it in the dialog.
- `revalidatePath` of Inicio and the project's routes after success; the project page then 404s.
- Tests: a `tests/unit/project-remove-panel.test.ts` with fakes: wrong name, wrong/blocked/reused
  code, TOTP off, no session, success (rows then agent, audit), agent refused after rows (partial
  notice), `_preview`/reserved refused. The CLI's existing tests still pass unchanged.

### How to verify
- typecheck, lint, `bun run test:related`, then the full suite alone.
- a11y skill on the code (dialog, the typed-name field's label, errors announced, focus).
- `security-review` on `.qa/review.diff` (the web gains a destructive agent op).

### Closing
Changeset: **minor** — "Puedes eliminar un proyecto desde el panel escribiendo su nombre y el
código de tu app de autenticación; sus bases de datos se conservan." Copy provisional (rows
49–51). Decision: D069 (panel removal behind typed name + fresh TOTP, same sequence as D059).
Manual actions: none beyond the next ship.
