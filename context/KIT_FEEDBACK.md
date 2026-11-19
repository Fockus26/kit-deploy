# Kit feedback — kit-deploy

> What the **web-agent-kit** did wrong, too much or too little in this project, to improve
> it. It is not the project's diary: it is material for the kit. Searched with `grep`, not
> read by default. Kit version it started on / was updated to: see `.kit-version`.

## When a row is added (the agent does it, without being asked)

| Type | Signal |
|---|---|
| **Correction** | César corrects something the agent did following the kit ("no, así no", "otra vez el…", reverts a change) |
| **Repetition** | César had to ask for the same thing a second time, or do by hand a step the kit could do |
| **Gap** | The kit did not say what to do and the agent had to improvise or ask something that should be settled |
| **Friction** | A kit step cost a lot for what it gave (tokens, time, ceremony), or an instruction was wrong |
| **Prevention** | A QA report brings a class finding not yet in the kit's `reference/QA-PREVENTION.md` (its "Prevención" row): the rule that would have prevented it while building |

Not logged: agent mistakes the kit already clearly forbids (that is something else), or
preferences of this project alone (they go to `decisions/`).

**If a row for the same problem already exists, it is not duplicated: add 1 to "Times",
update the date and, if it was marked as sent (`→ PR …`), remove the mark** (so the next
send carries it with the new count). What repeats is what is most worth fixing.

## Log

| # | Date | Type | Times | Kit piece | What happened (1 line) | Proposal (1 line) |
|---|---|---|---|---|---|---|
| 1 | 2026-11-10 | Gap | 1 | project-kickoff skill › Phase tracks | No track fits an infrastructure-first project (server, agent, CLI, then a dashboard); a custom track was improvised | Add an "Infra" track: own phases first, the UI phases nested in a "Dashboard" phase → PR Fockus26/web-agent-kit#35 |
| 3 | 2026-11-10 | Friction | 1 | `new-project.ps1` + `reference/scripts/qa-local.ts:552` | A fresh project fails `typecheck` (`env.NODE_ENV = …`: read-only with Next 16 types) and `lint` (tsconfig.json left with CRLF) | `Object.assign(env, { NODE_ENV: "production" })` in the kit; run `biome format --write` at the end of `new-project.ps1` → PR Fockus26/web-agent-kit#35 |
| 2 | 2026-11-10 | Repetition | 1 | project-kickoff skill › Block C, personality | César asked to *see* the directions instead of reading them, then a mix and variations | Render the 3 directions as a quick Design canvas (same screen each) before asking him to choose → PR Fockus26/web-agent-kit#35 |
| 4 | 2026-11-11 | Friction | 2 | `biome-templates` / kit biome.json › `files.includes` | `!**/.claude/worktrees` also matches the worktree root, so `bun run lint` inside a pool slot ignores every file and exits 1 | Exclude worktrees relative to the root (`!.claude/worktrees`) or document `--config-path` for slots → PR Fockus26/web-agent-kit#35 |
| 5 | 2026-11-11 | Gap | 1 | `reference/vps/bootstrap.sh` + VPS-POSTGRES.md | The kit leaves db.<domain> on certbot standalone; any later web server on :80 breaks its renewal silently (brief Trap) and each project solves it alone | bootstrap.sh: issue by webroot from day one (`/var/www/acme`), or ship the standalone→webroot migration kit-deploy wrote → PR Fockus26/web-agent-kit#35 |
| 6 | 2026-11-13 | Gap | 1 | kit docs/scripts for César on Windows (`bash <script>.sh` commands) | `bash scripts/ship.sh …` from PowerShell ran WSL's bash.exe (no distro: `execvpe(/bin/bash) failed`); César had to ask | Give César's commands as `& "C:\Program Files\Git\bin\bash.exe" …` (or "open Git Bash"), or ship a `.ps1` wrapper → PR Fockus26/web-agent-kit#35 |
| 7 | 2026-11-14 | Friction | 1 | `scripts/qa-local.ts` › Postgres | Calls `bun run db:migrate`, which a Drizzle project built without the kit's scripts may not have (kit-deploy had `scripts/migrate.ts` only); the first `initdb` on an HDD also outlasted its readiness wait | Check the script exists and say which to add; wait longer (or poll `pg_isready`) on the first container start → PR Fockus26/web-agent-kit#35 |
| 8 | 2026-11-17 | Gap | 1 | `reference/vps/kit-db` › `create` | Its retry path reuses an existing role with no database and resets its password (`ALTER ROLE … PASSWORD`): whoever may run `kit-db create` can break a role kit-db did not create (security review U5, kit-deploy `db.create`) | Only reuse a role kit-db has a `dbs/<name>.env` for; refuse any other existing role → PR Fockus26/web-agent-kit#35 |

## Sending it to the kit

When César asks for it (or when closing phase 09): the **`kit-feedback`** skill
(`/kit-feedback`). It builds the report with the unsent rows, grouped by kit piece with the
most repeated first, and opens a PR on the kit's repo with the `kit-feedback` label. Sent
rows get marked with `→ PR <owner/repo#N>` in "Proposal" (they are not deleted).
| 9 | 2026-11-17 | Gap | 1 | `orchestrate` › phase 05 start (UI phase without `design/HANDOFF.md`) | The skill mapped and launched UI units with no handoff; César had to stop the wave to decide the design | Before §0 of a UI phase, check `design/HANDOFF.md` exists; if not, stop and offer: Claude Design / design canvas in the session / build from the brief → PR Fockus26/web-agent-kit#35 |
| 10 | 2026-11-17 | Friction | 1 | `orchestrate` › unit prompt for daemon work | The W2 prompt proposed one long-lived `docker logs -f` child per container, ignoring kit-agent's `MemoryMax=256M` (worker switched to the Docker API, D024) | Prompt template: for daemon units, check the unit's cgroup limits before proposing long-lived child processes → PR Fockus26/web-agent-kit#35 |
| 11 | 2026-11-17 | Friction | 8 | `security-review` skill from a pool slot | It took git status/diff from the main folder (empty) instead of the worker's slot; the worker passed the diff by hand | Accept a path/branch, or use the worktree's cwd → PR Fockus26/web-agent-kit#35 |
| 12 | 2026-11-17 | Wrong | 1 | `orchestrate` › brief-template rebase rule | The brief allowed `--force-with-lease` on the worker's own branch; auto mode denies it, CLAUDE.md forbids it, and the rebased PR was stuck in conflict (republished as a new branch) | Update branches with `git merge origin/main` + plain push; never a rebase that needs a force-push → PR Fockus26/web-agent-kit#35 |
| 13 | 2026-11-17 | Friction | 2 | `orchestrate` › resume message after an API cut | The resume message cited `.qa/progress.md`, which no worker had written, and guessed the step from the last line (W3, W4) | Resume with "`git status` + `git log` are the truth"; the brief asks for `.qa/progress.md` from the first wip commit → PR Fockus26/web-agent-kit#35 |
| 14 | 2026-11-17 | Gap | 1 | `orchestrate` › reserved migration numbers | Regenerating a migration to renumber it drops hand-written SQL (W4's `UPDATE`) | Brief: keep hand-written SQL apart and re-add it after `db:generate` → PR Fockus26/web-agent-kit#35 |
| 15 | 2026-11-17 | Gap | 2 | `scripts/pr-screenshots.ts` | No `storageState`/cookie option: signed-in screens cannot be captured, so W1's PR went without images | Add a `storageState` field per shot (or a global one) → PR Fockus26/web-agent-kit#35 |
| 16 | 2026-11-17 | Friction | 2 | `orchestrate` brief › Playwright and builds with 4 slots | `next build` hung twice with 4 slots busy (W10); Playwright on `next dev` hung on `load` (W11) | Run flows/guards on `--preview` from the first try; the orchestrator runs one build per wave, workers rely on CI → PR Fockus26/web-agent-kit#35 |
| 17 | 2026-11-17 | Gap | 1 | `orchestrate` › UI pages wave on Windows | Each page unit would rewrite a fake kit-agent; unix sockets give EACCES on Windows (W10 used `\.\pipe\…`) | A shared `scripts/qa-fake-agent.ts` on a named pipe, planned in the components wave → PR Fockus26/web-agent-kit#35 |
| 18 | 2026-11-17 | Gap | 1 | `orchestrate` › wave plan for parallel page units | Two units each added `components/ui/native-select.tsx` (W10, W11) → conflict | List the shared primitives a wave needs and give each to one unit (or the components wave) → PR Fockus26/web-agent-kit#35 |
| 19 | 2026-11-18 | Gap | 1 | `orchestrate` › §4 reserving decision IDs | IDs reserved for W14 (D047–D048) were taken meanwhile by another session (phase 06) working in the main folder; the worker renumbered to D050–D051 | Reserve against origin/main **and** open PRs / other live sessions, or let the worker take "next free after merging main" and report it → PR Fockus26/web-agent-kit#35 |
| 20 | 2026-11-18 | Friction | 1 | brief rule 10 (file edits) | `python -` with a quoted heredoc still turned `\n` into a newline in the Bash tool; two patches failed silently, one broke a test string | Rule 10: no `python -` heredoc for text with backslashes — Edit, or a script file in `.qa/` → PR Fockus26/web-agent-kit#35 |
| 21 | 2026-11-18 | Friction | 1 | UPDATES.md 3.23.0 step 2 + kit-update §8 | `new-project.ps1 -OnlyPieces` already refreshed `.claude/skills`, `agents` and `kit-reference`, so the separate `install-kit --project .` step had nothing left to do, and the kit copy ended up uncommitted alongside the 3.23.0 files | Say that `-OnlyPieces` refreshes the kit copy, and that it is committed apart at the end |
| 22 | 2026-11-18 | Friction | 3 | `orchestrate` › brief for 5 parallel workers on one laptop | Full suite ~450 s and typecheck >3 min with 5 slots busy; spurious 5 s timeouts in agent tests (metrics, alerts, cli socket); W1, W4, W5 all hit it | Brief: stagger full suites (or let CI be the full run) and raise those tests' timeout |
| 23 | 2026-11-18 | Bug | 1 | `security-review` skill from a pool slot | Reads the main folder's git (its branch), not the slot's; W5 redid it with a subagent over the slot's `git diff origin/main...HEAD` | Brief says so, or the skill takes a path/branch argument |
| 24 | 2026-11-18 | Gap | 1 | `orchestrate` › §4 reserved numbers | "Migration: none" for a unit that adds an audit action — the CHECK lists the actions, so it needs one (W5 took 0015; W3 may collide) | Reserve a migration number whenever a prompt asks for a new audit action / enum value |
