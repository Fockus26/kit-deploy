# Plan — phase 04 (Variables and databases) · agreed with César 2026-11-17

One unit = one branch = one PR. The dashboard page for variables is phase 05; here: storage,
agent, CLI, API, the switch wiring and the template.

## The rule that shapes every unit

Only kit-agent reads `master.key` (D011). Every value is stored encrypted (AES-256-GCM, key from
HKDF-SHA256 over master.key, `key_version` column for a later rotation). The AAD binds each blob to
`project | environment | name | secret`, so a row cannot be copied to another name, environment or
flag in the database without failing to open.

The agent reveals a value (`env.reveal`) **only** when its AAD says `secret=false`, or when the
environment is Development (for `env pull`). A Production/Preview secret is never returned by any
operation: the agent only decrypts it into the env file of the container it is starting
(`/run/kit-deploy/env/<container>.env`, root 0600, removed after `docker run`; Docker keeps it in the
container's root-only config, so a reboot needs nothing).

## Units

| # | Unit | What | VPS |
|---|---|---|---|
| U1 | core crypto + schema | `lib/core/crypto.ts` seal/open (HKDF, AAD, tamper/wrong-key/wrong-AAD tests); migration 0006 `env_vars` (one row per project·env·name, ciphertext/iv/tag/key_version, secret flag) and `audit_log` (actor, action, project, env, name, at — never the value). Name `^[A-Z_][A-Z0-9_]*$`; reserved: PORT, HOSTNAME, NODE_OPTIONS; managed: DATABASE_URL, NEXT_SERVER_ACTIONS_ENCRYPTION_KEY; `NEXT_PUBLIC_*` cannot be secret | — |
| U2 | agent: `env.seal`, `env.reveal` | seal a value from the caller; reveal under the rule above; tests that a Prod/Preview secret is refused | release |
| U3 | CLI `env ls / set / rm` | `set` reads stdin (no echo on a TTY, `--plain` for a non-secret); `ls` shows the value only for plain ones; audit row with the SSH user | — |
| U4 | switch: variables into the container | `container.run` gets the environment's sealed rows; the agent writes the env file and passes `--env-file` (`--env` still wins for PORT/HOSTNAME/NODE_OPTIONS) | release |
| U5 | managed variables | `DATABASE_URL` from `kit-db url <p>` (Production) and `<p>_preview` (Preview), resolved by the agent at each start, never stored (César 2026-11-17; after `kit-db rotate` a redeploy is enough); `kit-deploy db create <p>` (both databases); the Server Actions key moved to U7 (Next 16: set at `next build`, embedded in the output) | yes, César's OK (creates databases) |
| U6 | `env pull` | Development set to stdout; refuses if stdout is a terminal (nothing on screen) | — |
| U7 | `/api/v1/build-env` + template | the Action reads only its environment's `NEXT_PUBLIC_*` with its repo's deploy token, writes `.env.production` before `next build`; template `deploy-vps.yml` updated | — |
| U8 | redeploy / rebuild | `kit-deploy redeploy <p> <env> [--pr n]` (same image, new container); `env set/rm` says which one the change needs; rebuild = `workflow_dispatch` (César adds Actions: Read and write to the GitHub status token, 2026-11-17) | — |

## Close

- security-review of crypto, the agent ops and build-env.
- On the VPS: a secret set with `ssh kit-vps kit-deploy env set` is unreadable from CLI, API and a
  `pg_dump` of kit_deploy; kd-hello reads it at runtime and its `DATABASE_URL`; `env pull` writes a
  `.env.local` that runs kd-hello locally.
- master.key in César's password manager (CONTENT_CHECKLIST #4) before the first real secret.
- context/ + `context:backup`.
