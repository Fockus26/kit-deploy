# Phase 04 — Variables and databases

## Goal

Variables per environment, encrypted, set without anyone seeing a secret; databases wired by themselves.

## Scope

- AES-256-GCM with `/etc/kit-deploy/master.key` (D012); `env_vars` and `audit_log` (who, when, name —
  never the value).
- Sets Production / Preview / Development; secret (write-only) or plain.
- CLI: `env ls <p> <env>`, `env set <p> <env> <NAME>` (value from stdin, typed by César),
  `env pull <p> > .env.local` (Development set, nothing printed).
- `/api/v1/build-env`: the Action reads only its environment's `NEXT_PUBLIC_*` with its repo token.
- `DATABASE_URL` put into Production and Preview from `kit-db url` (and `<p>_preview`); a stable
  `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` per project.
- After a change: "redeploy" (runtime var: same image, new container) or "rebuild" (`NEXT_PUBLIC_*`:
  `workflow_dispatch`).

## Closes when

- [ ] A secret set from `ssh kit-vps kit-deploy env set` is never readable afterwards (CLI, API, DB dump).
- [ ] `env pull` writes a `.env.local` that runs `kd-hello` locally.
- [ ] A backup of `kit_deploy` alone cannot decrypt any variable (the key is not in it).
- [ ] `security-review` of crypto and the build-env endpoint.
