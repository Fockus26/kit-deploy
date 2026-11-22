# D069 · Panel · Eliminar proyecto: the typed name + a fresh TOTP code, then `project rm`'s own steps (D059), shared code · Implemented

**Decision:** the project header gets "Eliminar" (destructive-text, next to Parar; "Eliminar
proyecto" in Más acciones below 768 px), enabled even with nothing live. Its dialog lists what goes
(the footprint read when it opens: deployments, previews, domains by name, variables, deploy tokens
and cron jobs as counts, open alerts closed without email, and the machine's containers, Caddy files
and images) and what stays (the databases `<p>` and `<p>_preview`, the audit log, closed alerts),
then asks for the name typed and the authenticator app's current 6-digit code; the submit stays off
until both are right and while in flight. The Server Action (`lib/panel/actions/project-remove.ts`)
checks, in order: session → form → typed name equals the project → never a reserved or `_preview`
name → `two_factor_enabled` → `panelTotpGuard` (`lib/panel/totp-guard.ts`, the one guard every TOTP
action shares) → Better Auth's verify-totp → **kit-agent answers a dry run** → the rows → kit-agent's
`project.remove`. The removal itself is `lib/ops/project-remove.ts` `removeProject`, which
`kit-deploy project rm --yes` now calls too (its output unchanged). Audit `project.remove`, actor
`web:<user id>`. A wrong code logs `failedLine(…, "/panel/project-remove", 401|429)`.
**Why:** César could only stop kd_hello from the panel, not remove it (2026-11-22). A stolen cookie
alone must not wipe a project (D055's reasoning; the panel has no password, D003). The dry run
first: with kit-agent down the CLI's order would drop the rows and leave the site served with no
page in the panel to finish it from; a read-only call changes nothing in D059's order of mutations.
**Discarded alternative:** a second copy of the CLI's sequence in the panel (two places to keep in
D059's order); extending `ConfirmDialog` (it closes on confirm; a wrong code must keep the dialog
open with the error on its field); the footprint in the project layout (seven queries on every
project page for a dialog rarely opened); a "Zona de peligro" at the bottom of Resumen (the prompt
places it with the header's actions).
