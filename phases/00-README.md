# phases/ — kit-deploy

Own track, infrastructure first (D018), from the brief's "Suggested phases"
(`web-agent-kit/prompts/VPS-PLATFORM-BRIEF.md`). Each phase runs to completion before the next and
is made of **units** — one branch, one PR that César reviews and merges.

| # | Phase | Run by |
|---|---|---|
| 01 | Server ready | `backend-build` (infra) |
| 02 | One site by hand | `backend-build` |
| 03 | Previews | `backend-build` |
| 04 | Variables and databases | `backend-build` |
| 05 | Dashboard — runs the kit UI phases in `ui/` | `frontend-build` (+ `backend-build` for its server actions) |
| 06 | Alerts and cron | `backend-build` |
| 07 | First real project: maranatha | `backend-build` + César |
| 08 | Back into the kit | agent + `kit-feedback` |
| 09 | Final QA ("Done when") | `functional-qa` + `design-qa` |

`ui/` holds the kit's UI phases (01 Tokens … 09 Final QA) as phase 05's sub-steps; `ui/07-BACKEND.md`
is reference only.

## Common rules

- **The VPS:** every unit that changes the server first passes its script's `--test` in Docker, then
  shows César the exact commands; it runs on `ssh kit-vps` only with his OK for that unit. Never touch
  the unrelated containers (gaby, evolution_*).
- **Secrets:** César types them in his terminal (stdin) or in a dashboard field; never in the chat, a
  file in git, a log or a PR.
- Each phase closes by updating `context/` (`decisions/`, `CONTENT_CHECKLIST.md`,
  `PHASE_LOG/0N-<phase>.md`, `CURRENT_PHASE.md`) and `bun run context:backup`.
- `security-review` before closing phases 03, 04 and 05.
- No phase closes with `a11y` red where UI was touched.
