# D011 · Layout · Repo: app/ (dashboard + /api/v1), agent/, cli/, lib/core/, infra/, templates/, drizzle/ · Pending

**Decision:** `app/` Next.js dashboard and the Actions' API; `agent/` root daemon on
`/run/kit-deploy/agent.sock` with a closed list of operations (docker run/stop/pull/rm, write
`/etc/caddy/sites/*.caddy` + `caddy reload`, kit-db, cron), validated with zod; `cli/` the SSH interface
(list, status, env ls/pull/set, logs, deploy, rollback, regenerate, version); `lib/core/` crypto, Caddy and
Docker rendering, ports; `infra/` server-ready script, systemd units, base Caddyfile, daemon.json, self-update
script; `templates/` the Dockerfile and `deploy-vps.yml` for projects; `drizzle/` migrations.
**Why:** the brief's architecture (the web app never mounts the Docker socket) mapped to folders.
