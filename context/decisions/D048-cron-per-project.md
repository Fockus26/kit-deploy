# D048 · Cron · One root tick per minute, GET through kit-agent with the CRON_SECRET opened there · Confirmed (2026-11-18)

**Decision:** `cron_jobs` (project, route path, five-field schedule in UTC, enabled) and `cron_runs`
(one row per job and scheduled minute, status, HTTP code, duration, error; 30 days). `kit-deploy
cron tick` (root, `kit-deploy-cron.timer` at :00 of every minute) runs each enabled job that matches
the minute, side by side: the run row claims the minute (unique per job and slot, so two ticks
never call twice), then kit-agent's new `cron.call` op GETs `http://127.0.0.1:<port><path>` with
`Authorization: Bearer <CRON_SECRET>` — the secret goes to the agent sealed and is opened only for
the header, never returned or logged — and only if the port is that project's running production
container (a caller cannot send one project's secret to another's container). A route has 50 s;
2xx is ok, anything else (or no answer) is a failed run with its reason. Missed minutes (VPS down)
are not caught up, like Vercel Cron. Production only, no previews. CLI: `cron ls|add|rm|pause|
resume|run|runs`; adding, removing and pausing are audited (`cron.*`, migration 0013).
**Why:** brief F12, replacing the hand-made systemd timers of `tech/vps-postgres.md` with the same
contract the kit already teaches (a route protected with `CRON_SECRET`), and D011: the root CLI
never reads a Production secret's value.
**Discarded alternative:** one systemd timer per job (more units to generate and keep in sync with
the database; the log would live in the journal, not in the panel); `env.reveal` of CRON_SECRET to
the CLI (breaks phase 04's rule that a Production secret never leaves the agent); POST (Vercel
Cron sends GET, and the kit's routes are written for it).
