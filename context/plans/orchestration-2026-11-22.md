# Orchestration of 2026-11-22 — shared brief for the workers

> Standalone batch, one wave. Prompts: `context/plans/orchestration-2026-11-22-prompts.md`.

> **Every worker** reads this before starting. Main folder of the repo:
> `C:\Users\Cesar\Documents\Work\kit-deploy` (local/gitignored files live there:
> `context/CURRENT_PHASE.md`, `context/CONTENT_CHECKLIST.md`, `context/PHASE_LOG/`,
> `context/plans/`). Its `context/` is `C:\Users\Cesar\Documents\Work\kit-deploy\context`: always
> that absolute path.
>
> **Project facts:** test runner `bun:test` · linter `bun run lint` / `bunx biome check <files>` ·
> the kit's `reference/…` in `~/.claude/kit-reference/` · Next.js 16: read
> `node_modules/next/dist/docs/` before any Next API you are not sure of (AGENTS.md).

## Units and order

| # | Branch | What | Wave | Slot / port |
|---|---|---|---|---|
| W1 | `feat/backup-codes-totp` | Ajustes › Códigos de recuperación: ver y generar nuevos con un código TOTP | 1 | given at launch |
| W2 | `feat/panel-project-remove` | Eliminar proyecto desde el panel (nombre escrito + código TOTP) | 1 | given at launch |

Both in parallel. They touch disjoint files except the one shared file below.

## Reserved numbers

| Unit | Decision IDs | `CONTENT_CHECKLIST` rows | Migration |
|---|---|---|---|
| W1 | D067–D068 | 46–48 | `0017_backup_codes_audit` (the only migration of the batch) |
| W2 | D069–D070 | 49–51 | none (`project.remove` is already an audit action, 0015) |

Do not use numbers outside your range.

## Shared shapes

**One TOTP guard for every panel action confirmed with a fresh code.** Both units create this
file **byte-identical** (git merges an identical add/add cleanly), and neither edits it otherwise:

`lib/panel/totp-guard.ts`
```ts
/**
 * One TOTP guard for every panel action confirmed with a fresh code (D055, D067, D069): the
 * tries per user and the spent codes are shared, so a code that confirmed one action cannot
 * confirm another, and the limit is not multiplied by the number of actions. Server only.
 */
import { memoryTotpGuard } from "@/lib/auth/totp-check";

export const panelTotpGuard = memoryTotpGuard();
```

- **W1** changes `lib/panel/passkey-runtime.ts` to use `panelTotpGuard` instead of its own
  `const guard = memoryTotpGuard()`. **W2 does not touch `passkey-runtime.ts`.**
- Only W1 edits `lib/db/schema.ts` `AUDIT_ACTIONS` and `drizzle/`. W2 touches neither.
- Each unit's failed-try log line uses its own path in `failedLine`: W1
  `/panel/backup-codes`, W2 `/panel/project-remove` (same shape as `/panel/passkey-remove`).

## César's decisions for this batch

- **TOTP instead of a password** (César, 2026-11-22: "Sí, con el código"). The panel has no
  password (D003); a fresh 6-digit code checked on the server, exactly as D055.
- **No dev server, no Docker, no local build, no screenshots**: QA runs once at the end
  (César's standing rule). Verify by code and tests; CI runs the build. Say "screenshots: no
  (QA al final)" in the PR.
- The worker **does not merge**; the orchestrator does after green CI.

## Batch rules

Rules 1–5 and 9–19 of `~/.claude/skills/orchestrate/brief-template.md` › "Batch rules" apply
as written (read that section once). Rule 6 (server), 7 (browser), 8 (real data) and 14
(screenshots): not authorized in this batch — see above. Rule 13: Local build **no**.
`security-review` is required for both units (auth / the agent's operations): write
`git diff origin/main...HEAD > .qa/review.diff` and review that file.

Prevent what QA always finds: the TOTP field `inputMode="numeric"`, `autoComplete="one-time-code"`,
`z.string().trim()` + exactly 6 digits on the server; submit `disabled` while in flight and an
idempotent server; dialog buttons with `flex-wrap`; no state only by color; focus back to the
trigger when the dialog closes; WCAG 2.1 AA (a11y skill on the code, axe not runnable without a
server — say so).
