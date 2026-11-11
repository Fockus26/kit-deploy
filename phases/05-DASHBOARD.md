# Phase 05 — Dashboard

## Goal

The page: projects, deployments, previews, variables, domains, logs, metrics, databases, settings —
with the kit's design flow.

## Inputs

`design/BRIEF-kit-deploy.md` pasted in Claude Design → `design/HANDOFF.md` back (kickoff Step 6:
checked against the handoff template and reconciled with `context/`).

## Units

The kit's UI phases in `ui/`, in order: 01 Tokens · 02 Base layout (sidebar, header, theme switch) ·
03 Components (StatusBadge, CopyValue, RelativeTime, Meter, DataTable, ConfirmDialog, LogViewer) ·
04 Sections · 05 Pages (`context/PAGE_INVENTORY.md`) · 06 States (404, 500, empty, loading, errors) ·
08 Responsive and polish. Plus the server pieces they need: domains (F6: DNS instructions, resolve
check every minute, certificate state), logs (D014), metrics (D015), databases (F11).
A phase this size goes in waves with `orchestrate`.

## Closes when

- [ ] A variable can be set from the page and is never readable afterwards if secret.
- [ ] A domain added from the page serves HTTPS with no manual step besides the DNS record.
- [ ] `a11y` green on every unit; `security-review` of the server actions.
