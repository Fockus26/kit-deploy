# D050 · Data · A production stopped with Parar stays stopped: site-only rewrites never start a container · Implemented

**Decision:** a domain change (`domain rm` / `domain redirect`, panel and CLI) and the domain
check's timer (every minute, root) rewrite only the project's Caddy file
(`rewriteSiteFile` = `regenerate(sw, { project, start: false })`); they never call
`container.start`. Only these start a stopped production again: Reiniciar, a new deploy, a rollback
and root's explicit `kit-deploy regenerate` (after a reboot), which now says which container it
started (`ok kd_hello (its stopped container was started)`, `started: true` in `--json`).
The stop is **not** remembered in kit-deploy's database: Docker already remembers it, since every
project container runs with `--restart=unless-stopped` (`lib/core/docker.ts`), so a reboot does not
bring a stopped container back, and the only remaining path that does is a person typing
`regenerate` as root.
**Why:** phase 05's security review (M1): `regenerate` started every non-running live container, and
the domain paths called it, so a site César stopped came back by itself within a minute (the timer)
or at the next domain edit. Splitting "rewrite the file" from "start the container" fixes every
caller at once, and the CLI/panel wiring goes through one tested helper.
**Discarded alternative:** a `stopped` flag on the deployment (or a deployment state) that
`regenerate` honours — needs a migration and a second source of truth next to Docker's own state,
and `kit-deploy regenerate` is meant to be the explicit "bring every live site up" after a reboot;
making it skip stopped sites would leave César without that lever. Revisit if a stopped site ever
has to survive an explicit `regenerate`.
