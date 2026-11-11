# Phase 02 — One site by hand, end to end

## Goal

A throwaway Next.js app (`kd-hello`, at `hello.fockus.dev`) deploys on merge, switches with no
downtime and rolls back — driven by kit-agent through the CLI, no dashboard yet.

## Scope

- `lib/core/`: Caddy site rendering, Docker run args (memory limit, non-root, `127.0.0.1:<port>`
  D016, `--add-host db.fockus.dev:host-gateway`, `restart: unless-stopped`), port allocation.
- `agent/`: the root daemon on `/run/kit-deploy/agent.sock`, closed list of operations, zod-validated.
- `cli/`: `kit-deploy version | list | status | deploy | rollback | regenerate`, compiled with
  `bun build --compile` (D010), installed by `infra/install.sh`.
- `app/api/v1/deploy` with a per-repo token (hashed in `deploy_tokens`); first Drizzle schema
  (projects, deployments, deploy_tokens) in `drizzle/`.
- `templates/Dockerfile` (`output: 'standalone'`, `deploymentId: GIT_SHA`, `--max-old-space-size` at
  ~75 % of the limit) and `templates/deploy-vps.yml` (build → GHCR → POST deploy).
- The switch: new container beside the old → `/api/health` answers → site file → `caddy reload` →
  old one stopped after ~10 s. Keep the last 5 production images.
- kit-deploy's own update script (`infra/update.sh`: pull, migrate, restart), not through itself.

## Closes when

- [ ] A merge on `kd-hello` deploys production; the commit gets its status.
- [ ] A load test during a deploy shows no failed request.
- [ ] `kit-deploy rollback kd-hello` takes < 30 s and needs no build.
- [ ] Reboot brings the site back; with kit-deploy web stopped, the site still answers.
- [ ] `ssh kit-vps kit-deploy version` answers (from here the kit knows the platform exists, but
      projects stay on Vercel until phase 07).
- [ ] RAM of one site measured.
