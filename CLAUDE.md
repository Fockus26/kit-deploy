@AGENTS.md

# kit-deploy

Our own Vercel on César's VPS: preview per PR, deploy on merge, variables per environment, HTTPS
domains, rollback, logs, metrics, alerts and cron, with a dashboard and an SSH CLI for the agents.
Requirements: `web-agent-kit/prompts/VPS-PLATFORM-BRIEF.md`.

**Type:** dashboard/app + infrastructure · **Client:** César (own)
**Phase track:** own, infrastructure first (D018) · **Git mode:** pr (see `context/GIT_STATE.md`)
**Kit:** web-agent-kit, version in `.kit-version` (updated with `/kit-update`) ·
**Deployment:** none on Vercel (D009) — this is the platform; it runs on the VPS and updates itself
by `infra/update.sh` over SSH, never through itself

**Language:** talk to César in Spanish — questions, reports, PR titles and bodies, commit
descriptions. UI copy in Spanish; CLI output in English. Code and comments: like the code around them.

---

## What to read — by levels, not everything

**Always:** this file + `context/CURRENT_PHASE.md` (one screen: what is open and what blocks).

**Per task** — only the row that applies:

| If the task… | Also read |
|---|---|
| touches UI (component, section, page, styles) | `context/DESIGN_RULES.md`, and `COLORS.md` / `DESIGN_TOKENS.md` / `TYPOGRAPHY.md` only if it touches color, spacing or type |
| implements something from the design | that piece's part of `design/HANDOFF.md` (not the whole handoff) |
| touches the server, agent, CLI, data, auth or secrets | `context/PROJECT_CONTEXT.md` › Tech stack + the phase file in `phases/` + the brief's section it implements |
| changes the VPS | `phases/00-README.md` › Common rules (Docker `--test` first, César's OK) + kit `VPS-POSTGRES.md` |
| opens or closes a unit | `git-flow` skill + `context/GIT_STATE.md` |
| arrives with an orchestrator prompt | **only** what the prompt cites |

**Search, don't read:** `decisions/`, `CONTENT_CHECKLIST.md`, inventories, `PHASE_LOG/` —
`grep` the word or ID (`grep -rhi "^# D.*preview" context/decisions/`: decided? don't
re-litigate it) and open only what comes up.

**The kit's `reference/…`** = `~/.claude/kit-reference/…` (or `.claude/kit-reference/…`).
**Tech refs:** vps-postgres, vps-hosting → its `tech/<name>.md` when the task touches it; only these.

---

## Stack

- Next.js 16 (App Router) + strict **TypeScript** — dashboard and `/api/v1/*`
- `agent/` (root daemon, unix socket) and `cli/` (`kit-deploy`) in TypeScript, `bun build --compile` (D010, D011)
- **Component library:** shadcn/ui · **Styling:** Tailwind — only one
- **bun** for everything — never npm, yarn or pnpm
- Postgres `kit_deploy` (kit-db) + Drizzle · Better Auth (passkey + TOTP) · no payments · Brevo (alerts)
- Docker, Caddy (`caddy-dns/cloudflare`), GHCR, GitHub Actions

```bash
bun run build · typecheck · lint
bun run test:related         # while working; `bun run test` (whole suite) before the PR
bun run shots                # PR screenshots; then `shots:publish`
bun run context:backup       # local context/ → branch context-state (context:restore)
```

**Dev server:** César starts it, except the QA agents and workers he authorizes (each on its
port). Build, typecheck, lint and tests run without asking.

**QA:** `bun run qa:local -- --port <p>` — Postgres in Docker with the `.env.test.local` accounts
(you write it; never ask César to log in for QA); never the real database (`--offline`: guest
only). Server scripts: their `--test` mode in Docker. Playwright scripts run with `node` (Bun
hangs on Windows), in `.qa/`.

**Docs:** Context7 before any library API. **Model per task:** `Modelo recomendado: <model ·
effort>` before each (kit `TOKEN-ECONOMY.md` §12; risk → `opus`), both passed to `Agent(...)`.

---

## How work is done here

One unit at a time (a script, an agent operation, a CLI command, a screen, a fix),
something reviewable in two minutes. One unit = one branch = one PR.

```
[git-flow: open]  →  implement  →  test:related  →  [a11y if UI]  →  [security-review: auth, secrets, agent]
   →  build + typecheck + lint + test  →  screenshots (if the UI changed)
   →  prune and back up context/  →  [git-flow: close → PR]
```

- **`pr` mode:** commit and push your branch without asking — César approves in the PR
  review. **Never** push to `main`, `gh pr merge` or auto-merge.
- **Cloud session** (`CLAUDE_CODE_REMOTE=true`): `cloud-session` skill at start and close;
  it overrides the rule above (each unit ends merged).
- **Version:** nobody touches `version` or `CHANGELOG.md`. Visible change →
  `.changeset/<desc>.md` (`git-flow` §2.1.3). The `chore(release): versión` PR is opened by
  the Action and merged by César.
- Nothing destructive: no `reset --hard`, `push --force`, history rewriting or deleting
  branches. VPS: no `docker rm` of containers kit-deploy did not create, no `kit-db drop`.

### What goes in the repo and what is local

In git: `.kit-version`, `drizzle/`, `infra/`, `templates/`, and `context/` PROJECT_CONTEXT,
DESIGN_RULES, COLORS, DESIGN_TOKENS, TYPOGRAPHY, decisions/. Local (gitignored, backed up with
`context:backup`): CURRENT_PHASE, CONTENT_CHECKLIST, KIT_FEEDBACK, GIT_STATE, inventories,
PHASE_LOG/, plans/. `.env.local` written by hand from `.env.example` until `kit-deploy env pull`
exists (phase 04). Worktrees (pool slots, `.claude/worktrees/`) have the `.env*` but not the
local `context/`: it lives in the main folder (first line of `git worktree list`); without
write access there, return the changes in your report.

### Quality gates

`a11y` when UI is touched · `security-review` closing phases 03–05 and any change to
auth, crypto or the agent's operations · `git-flow` opening and closing each unit ·
`orchestrate` for phase 05 in waves · `wave-qa` after a wave with risk flows ·
`functional-qa` when a risk flow closes and at phase 09 · `design-qa` only at phase 09.
`seo`: N/A (private, `noindex`).

---

## Non-negotiable rules

- **Zero magic values.** Every color, spacing, radius and size comes from the tokens.
- **Zero secrets in the code, the chat, logs or PRs.** Secrets are typed by César (stdin or a
  dashboard field); the UI and API never return a secret's value; `.env.example` without values.
- **The web app never touches the Docker socket or the master key** — only kit-agent, through its
  closed, validated list of operations (D011).
- **Containers bind `127.0.0.1` only** (D016). **Sites never depend on the dashboard.**
- **Nothing on the VPS without its Docker `--test` and César's OK for that unit.**
- **Zero invented content.** Flagged placeholder + row in `context/CONTENT_CHECKLIST.md`.
- **Zero lorem ipsum.** A realistic placeholder, in Spanish, with the final text's length.
- **WCAG 2.1 AA** minimum: 4.5:1 text, visible focus, no state only by color, no horizontal
  scroll at 320 px.
- **The library before reimplementing** a primitive.

## When to stop and ask

- A handoff value is missing → ask, do not estimate it from the mockup.
- New visual decision → 3 options with real pros and cons, and wait (a background worker
  picks the conservative one and explains it in the PR).
- Accessibility rule broken → the rule wins. Problem in closed code → report it, not fixed in
  this unit. Unused file → point it out, **do not delete it**.
- Anything that could take a site or the central Postgres down → stop and ask.

## Kit feedback

César corrects what you did following the kit, asks for something twice, does by hand what
the kit could do, or the kit is silent → a row in `context/KIT_FEEDBACK.md` (or +1 in
"Times"), without asking, announced in one line. `/kit-feedback` sends it to the kit.

---

## Project context

**Audience:** César and the kit agents · **Main action:** see a deploy is up and act on it ·
**Tone:** precise, calm, technical · **Language:** Spanish UI

**Particulars:**
- Unrelated containers on the VPS (gaby, evolution_*): never touch them; they count against 8 GB.
- `db.fockus.dev`'s certificate moves to webroot before Caddy listens on :80 — losing it cuts every
  project from its database. `certbot renew --dry-run` after any change to ports 80/443.
