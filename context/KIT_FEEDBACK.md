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
| 1 | 2026-11-10 | Gap | 1 | project-kickoff skill › Phase tracks | No track fits an infrastructure-first project (server, agent, CLI, then a dashboard); a custom track was improvised | Add an "Infra" track: own phases first, the UI phases nested in a "Dashboard" phase |
| 3 | 2026-11-10 | Friction | 1 | `new-project.ps1` + `reference/scripts/qa-local.ts:552` | A fresh project fails `typecheck` (`env.NODE_ENV = …`: read-only with Next 16 types) and `lint` (tsconfig.json left with CRLF) | `Object.assign(env, { NODE_ENV: "production" })` in the kit; run `biome format --write` at the end of `new-project.ps1` |
| 2 | 2026-11-10 | Repetition | 1 | project-kickoff skill › Block C, personality | César asked to *see* the directions instead of reading them, then a mix and variations | Render the 3 directions as a quick Design canvas (same screen each) before asking him to choose |
| 4 | 2026-11-11 | Friction | 1 | `biome-templates` / kit biome.json › `files.includes` | `!**/.claude/worktrees` also matches the worktree root, so `bun run lint` inside a pool slot ignores every file and exits 1 | Exclude worktrees relative to the root (`!.claude/worktrees`) or document `--config-path` for slots |
| 5 | 2026-11-11 | Gap | 1 | `reference/vps/bootstrap.sh` + VPS-POSTGRES.md | The kit leaves db.<domain> on certbot standalone; any later web server on :80 breaks its renewal silently (brief Trap) and each project solves it alone | bootstrap.sh: issue by webroot from day one (`/var/www/acme`), or ship the standalone→webroot migration kit-deploy wrote |
| 6 | 2026-11-13 | Gap | 1 | kit docs/scripts for César on Windows (`bash <script>.sh` commands) | `bash scripts/ship.sh …` from PowerShell ran WSL's bash.exe (no distro: `execvpe(/bin/bash) failed`); César had to ask | Give César's commands as `& "C:\Program Files\Git\bin\bash.exe" …` (or "open Git Bash"), or ship a `.ps1` wrapper |

## Sending it to the kit

When César asks for it (or when closing phase 09): the **`kit-feedback`** skill
(`/kit-feedback`). It builds the report with the unsent rows, grouped by kit piece with the
most repeated first, and opens a PR on the kit's repo with the `kit-feedback` label. Sent
rows get marked with `→ PR <owner/repo#N>` in "Proposal" (they are not deleted).
