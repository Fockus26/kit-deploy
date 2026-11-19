# Orchestration of 2026-11-18 — shared brief for the workers

> Batch "mejoras del panel" (César, 2026-11-18), wave 1 of 2 — plan: `context/plans/batch-2026-11-18.md`

> **Every worker** reads this before starting. Its prompt carries only what is specific to its
> unit. Main folder of the repo: `C:\Users\Cesar\Documents\Work\kit-deploy` (the local/gitignored
> files live there: `context/CURRENT_PHASE.md`, `context/CONTENT_CHECKLIST.md`,
> `context/PHASE_LOG/`, `context/plans/`, `.env*`). Its `context/` is
> `C:\Users\Cesar\Documents\Work\kit-deploy\context`: always that absolute path.
>
> **Project facts:** test runner `bun:test` (`tests/unit/*.test.ts`, fakes in
> `tests/unit/agent-fakes.ts`, `deploy-fakes.ts`, `auth-fakes.ts`) · linter `bunx biome check
> <files>` · `bun run test:related` while working, `bun run test` before the PR · the kit's
> `reference/…` in `~/.claude/kit-reference/` · Next.js 16 — read `node_modules/next/dist/docs/`
> before any Next API (AGENTS.md) · Context7 before any library API · UI: `context/DESIGN_RULES.md`
> (+ `COLORS.md` / `DESIGN_TOKENS.md` / `TYPOGRAPHY.md` only if you touch color, spacing or type) ·
> Playwright scripts with `node`, in `.qa/`.

## Units and order

| # | Branch | What | Wave |
|---|---|---|---|
| W1 | `feat/panel-select` | shadcn Select (Radix) replaces every native select | 1 |
| W2 | `feat/panel-icons-meta` | favicon/app icons, OG image, base metadata (still `noindex`) | 1 |
| W3 | `feat/passkey-remove` | Remove a passkey from Ajustes, re-confirmed with a TOTP code | 1 |
| W4 | `fix/project-page-polish` | Tabs' stray vertical scroll, equal empty cards, Variables table + autoresize textarea | 1 |
| W5 | `feat/project-remove` | `kit-deploy project rm <project>` (agent op), to remove kd_hello | 1 |
| W6 | `feat/repo-picker` | Nuevo proyecto: searchable list of César's GitHub repos (read-only token) | 2 |
| W7 | `fix/panel-laptop-audit` | Laptop widths use the space; Auditoría 20 rows + real pagination | 2 |

Slot and port: in the message that launches each worker.

## Reserved numbers

| Unit | Decision IDs | `CONTENT_CHECKLIST` rows | Migration | Changeset | Model · effort | Docker | Local build |
|---|---|---|---|---|---|---|---|
| W1 | D053 | none | none | patch | sonnet · medium | no | no |
| W2 | D054 | 40 | none | patch | sonnet · low | no | yes |
| W3 | D055–D056 | 41–42 | none | minor | opus · medium | no | no |
| W4 | D057–D058 | none | none | patch | sonnet · medium | no | no |
| W5 | D059–D060 | 43 | none (unless your prompt says) | minor | opus · medium | no | no |
| W6 (wave 2) | D061–D062 | 44–45 | none | minor | opus · medium | yes (install test only) | no |
| W7 (wave 2) | D063 | none | none | patch | sonnet · medium | yes (qa:local only) | no |

**Wave 2 ownership:** W6 owns `app/(panel)/new/new-project-form.tsx`, the new
`components/ui/popover.tsx` / `command.tsx` / `components/kit/repo-combobox.tsx`, `infra/install.sh`,
`infra/update.sh`, `scripts/ship.sh` and the install test. W7 owns the panel pages' layout
containers, the audit in `lib/panel/data/store.ts` / `resources.ts` and `app/(panel)/settings/page.tsx`.
Nobody edits `app/(panel)/new/page.tsx` except W6. César authorizes W7 one dev server through
`qa:local` on its slot's port. `security-review` from a slot = a subagent over
`git diff origin/main...HEAD` of that slot.

## Shared shapes

- **Select primitive belongs to W1 only**: `components/ui/select.tsx` (shadcn new-york, on
  `radix-ui` already in `package.json`). Nobody else adds a select. W4 and W3 do not touch any
  select.
- **`components/kit/field.tsx` belongs to W4** (FieldTextarea autoresize). W1 and W3 use `Field` as
  it is.
- **Settings page**: W3 owns `app/(panel)/settings/tables.tsx` (passkeys table) and the passkeys
  part of `app/(panel)/settings/page.tsx`; W1 only touches `app/(panel)/settings/token-controls.tsx`.
  Audit paging is wave 2 (W7): W3 does not touch the Auditoría section.
- **Agent/CLI (W5 only)**: new op appended at the end of the `Request` union in
  `agent/protocol.ts`, one `case` in `agent/ops.ts` delegating to a new `agent/project-remove.ts`,
  CLI in `cli/commands.ts` (dispatch + usage lines only) or a new `cli/project-commands.ts`.
- If `origin/main` moved and conflicts: `git merge origin/main` and a plain push. **Never rebase
  pushed commits or force-push.**

## César's decisions for this batch

- The orchestrator merges on green CI (memory `agent-may-merge-prs`). Workers never merge.
- **No per-unit QA and no dev server for workers**: verify by code, unit tests and gates (a11y for
  UI units; security-review for W3 and W5). The full QA (functional-qa + design-qa) runs after
  wave 2, on `main`.
- **Nothing on the VPS.** W5's command is run on the VPS by the orchestrator later, with César's OK.
- Passkeys: removable from the dashboard **with a fresh TOTP code**; never the last way in.
- kd_hello: César wants it gone → W5 gives the platform a proper way; the databases are **kept**
  (CLAUDE.md: no `kit-db drop`), the command says so.
- Repos: a second fine-grained token (All repositories, Metadata: read) written by César → wave 2.
- New dependencies only those your prompt names.

## Simulating the backend

- Not needed in wave 1: no server. Unit tests with the existing fakes.
- Nothing from another slot's `.qa/`.

## Batch rules (on top of `CLAUDE.md`)

The 19 rules of the kit's brief template apply unchanged —
`C:\Users\Cesar\.claude\skills\orchestrate\brief-template.md` § "Batch rules", read them once.
