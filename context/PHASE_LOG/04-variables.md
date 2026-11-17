# Phase log — 04 Variables and databases

Plan: `plans/04-variables.md` (agreed 2026-11-17). Decisions that day: DATABASE_URL resolved by the
agent at each start, never stored; rebuild through `workflow_dispatch` (César adds Actions: Read and
write to the GitHub status token).

## U1 · core crypto + schema (#33, `feat/env-crypto`, 2026-11-17)

- `lib/core/env.ts`: the three environments, name rule `^[A-Z_][A-Z0-9_]{0,127}$`, reserved
  (PORT, HOSTNAME, NODE_OPTIONS) and managed (DATABASE_URL, NEXT_SERVER_ACTIONS_ENCRYPTION_KEY)
  names refused, `NEXT_PUBLIC_*` never secret, values one line (Docker env file), ≤ 32 KiB, never
  echoed in an error.
- `lib/core/crypto.ts`: key = HKDF-SHA256(master.key's 32 bytes, info "kit-deploy env v1");
  AES-256-GCM, 12-byte random IV, 16-byte tag; AAD = version · project · environment · name ·
  secret|plain, NUL-separated. One message for every failure to open.
- Migration 0006: `env_vars` (unique per project·env·name, checks mirroring lib/core/env and the
  base64 lengths, cascade on project delete) and `audit_log` (by project name, so it outlives the
  project; actor `ssh:<user>`/`web:<id>`; never a value).
- Verified: 23 unit tests (round trip, fresh IV, wrong key, AAD moved to another project / env /
  name / secret→plain, tampered ciphertext / tag / IV / version, same error message); migrations
  0000–0006 on postgres:17 in Docker + `.qa/env-schema-check.ts` with real sealed blobs: 17/17
  (slot unique, public-not-secret, managed/reserved refused, formats, cascade).
- Limitation, said in the PR: multi-line values (a PEM key) are refused, because Docker's env file
  has no quoting. If a project needs one: base64 it, or a later unit decides another transport.
- Note for later units: Docker Desktop on the laptop answers the host port ~80 s after Postgres is
  ready inside the container; wait from the host, not with `docker exec pg_isready`.
- Full suite 485 pass / 0 fail (a first run under load — Postgres in Docker + typecheck — had 4
  timeouts; clean on two re-runs). security-review: no findings.
- Branch: `feat/env-crypto-schema` picked up 0c42cf7 (perf/faster-ship, another session sharing this
  folder); the PR is from `feat/env-crypto` = origin/main + the cherry-picked commit. The old branch
  is left as it is (not deleted).
