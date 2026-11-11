# Section Inventory — kit-deploy

> Page sections (blocks of a single page, not reused across different pages — if they are
> reused, they probably belong in `COMPONENTS_INVENTORY.md`). Filled in phase 05.

| Section | Path | Page(s) | Phase that closed it | Status | Notes |
|---|---|---|---|---|---|
| VpsStatus | `app/(dash)/_sections/vps-status.tsx` | Home | — | Pending | RAM, disk, load |
| ProjectList | `app/(dash)/_sections/project-list.tsx` | Home | — | Pending | |
| ProjectHeader | `app/(dash)/p/[project]/_sections/header.tsx` | Project | — | Pending | Redeploy/Rollback/Restart/Stop |
| MetricsRow | `app/(dash)/p/[project]/_sections/metrics.tsx` | Project | — | Pending | D015 |
| LiveLogs | `app/(dash)/p/[project]/_sections/live-logs.tsx` | Project, Logs | — | Pending | may move to components if reused |
| EnvTable / EnvForm | `app/(dash)/p/[project]/env/_sections/` | Variables | — | Pending | |
| DnsInstructions | `app/(dash)/p/[project]/domains/_sections/` | Domains | — | Pending | |

<!-- Paths are the proposal; the handoff and phase 05 may change them. -->
