# Orchestration of 2026-11-17 — shared brief for the workers

> Phase 05, wave 1 of 4 — plan: `context/plans/phase-05-dashboard.md`

> **Every worker** reads this before starting. Its prompt carries only what is specific to its
> unit. Main folder of the repo: `C:\Users\Cesar\Documents\Work\kit-deploy` (the local/gitignored
> files live there: `context/CURRENT_PHASE.md`, `context/CONTENT_CHECKLIST.md`,
> `context/PHASE_LOG/`, `context/plans/`, `.env*`). Its `context/` is
> `C:\Users\Cesar\Documents\Work\kit-deploy\context`: always that absolute path.
>
> **Project facts:** test runner `bun:test` (`tests/unit/*.test.ts`, fakes in
> `tests/unit/agent-fakes.ts`, `deploy-fakes.ts`, `auth-fakes.ts`) · linter `bunx biome check
> <files>` · the kit's `reference/…` in `~/.claude/kit-reference/` · Next.js 16 — read
> `node_modules/next/dist/docs/` before any Next API (AGENTS.md) · Context7 before any library API.

## Units and order

| # | Branch | What | Wave |
|---|---|---|---|
| W1 | `feat/dashboard-shell` | Panel shell: tokens check, theme switch, sidebar + header behind the session, local session for QA | 1 |
| W2 | `feat/agent-logs` | D014 runtime logs: follower, `logs.tail` / `logs.search`, CLI `logs` | 1 |
| W3 | `feat/metrics` | D015 metrics: `metric_samples` (migration 0009), sampler, rollups, CLI `metrics` | 1 |
| W4 | `feat/domains-backend` | F6 domains: add/remove/list, www redirect, DNS check, cert state (migration 0010) | 1 |

Slot and port: in the message that launches each worker.

## Reserved numbers

| Unit | Decision IDs | `CONTENT_CHECKLIST` rows | Migration | Changeset |
|---|---|---|---|---|
| W1 | D021–D023 (D021 = "UI from the brief, no handoff") | 15–17 | none | minor |
| W2 | D024–D025 | none | none | minor |
| W3 | D026–D027 | none | `0009_*` | minor |
| W4 | D028–D029 | 18–19 | `0010_*` (W3's 0009 merges first; rebase and regenerate when asked) | minor |

## Shared shapes

Three units (W2, W3, W4) add agent operations. To keep the rebases trivial:

- **Implementation in a new file per unit** (`agent/logs.ts`, `agent/metrics.ts`,
  `agent/domains.ts`), its own tests file (`tests/unit/agent-logs.test.ts`, …). In the shared
  files, **only the minimal hunk**: the new `op(...)` entries appended at the **end** of the
  `Request` union in `agent/protocol.ts` (before the closing `]);`), one `case` block per op in
  `Agent.execute` in `agent/ops.ts` that delegates to your file, and new `Deps` methods only if
  unavoidable (append at the end of the interface + `system.ts` + `tests/unit/agent-fakes.ts`).
- **CLI**: a new file `cli/<topic>-commands.ts` (like `cli/env-commands.ts`); in
  `cli/commands.ts` only the dispatch line and the usage lines.
- **infra**: a new systemd unit/timer goes in `infra/` with the sweep's style
  (`infra/kit-deploy-preview-sweep.{service,timer}`) and is installed in `infra/update.sh` next to
  the sweep's lines; append, do not reorder.
- Op names: `logs.tail`, `logs.search` (W2) · `metrics.sample` (W3) · `cert.status`,
  `dns.resolve` (W4). Error codes: the existing `ErrorCode` union only.
- If `origin/main` moved and conflicts: `git merge origin/main` (a normal merge commit; the PR is
  squash-merged) and a plain push. **Never rebase pushed commits or force-push** (auto mode denies
  it; CLAUDE.md forbids it).

## César's decisions for this batch

- "Continúa con la fase 5 sin interrupción hasta completarla, puedes mergear": the orchestrator
  merges on green CI. Workers never merge.
- **QA once at the end** (phase 09): no per-unit QA. Close with build/typecheck/lint/tests (+ a11y
  for UI units).
- **Nothing on the VPS.** All agent/infra work is verified with unit tests and fakes; the Docker
  install test (`bun run test:infra:install`) is run by the orchestrator once per phase, not by
  you — unless your prompt says "Docker: yes".
- **No Claude Design handoff** (D021): UI from `design/BRIEF-kit-deploy.md` §4–§7 + `context/`
  tokens. Visual choices not covered: the conservative option + "Decisión tomada / alternativa"
  in the PR.
- New dependencies only those your prompt names.

## Simulating the backend

- Wave 1: W1 creates the local-session path (see its prompt) — `qa:local` Postgres in Docker plus
  a script that signs the QA account in locally. Agent units do not need it.
- Nothing from another slot's `.qa/`.

## Batch rules (on top of `CLAUDE.md`)

The 19 rules of the kit's brief template apply unchanged —
`C:\Users\Cesar\.claude\skills\orchestrate\brief-template.md` § "Batch rules", read them once.
Project specifics on top of them:

- Rule 6 (server): only W1 (`bun run qa:local -- --port <your port>`, Docker: yes). The rest: no
  server.
- Rule 8 (real data): there is no production `.env` in the slots — `.env.local` does not exist;
  `.env.test.local` holds a local QA account (never print its values).
- Rule 14 (screenshots): UI units only.
- Rule 16, the QA-PREVENTION rows that apply to this phase: every text field `z.string().trim()
  .min(1).max(<column max>)` on the server; submit `disabled` + `aria-busy` while in flight and an
  idempotent server; `method="post"`/Server Action as `action`; a POST without session gets
  401/403, never a redirect; every outbound call with `AbortSignal.timeout`; button rows
  `flex-wrap`; never `truncate` alone.
- Security: anything touching the agent, auth or secrets also passes the `security-review` skill
  on your diff before the PR; findings High/Critical fixed in the same PR.
- PHASE_LOG: `context/PHASE_LOG/<branch-with-dashes>.md` in the main folder.
