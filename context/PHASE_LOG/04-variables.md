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

## U2 · agent env.seal / env.reveal (`feat/agent-env-ops`, 2026-11-17)

- The agent reads master.key on first use (`readFile`, cached derived key); missing/malformed →
  `invalid_config`, never the content.
- `env.seal {project, environment, name, secret, value}` → Sealed; settable names only (managed are
  the agent's own), NEXT_PUBLIC_* never secret, one-line value.
- `env.reveal {project, environment, vars[≤100]}` → [{name, value}]: the whole request is checked
  first; any secret outside Development → `forbidden` (new error code), duplicates and managed names
  → bad_request. Lying `secret:false`, or calling a production row development, fails the AAD
  ("<NAME> cannot be decrypted").
- MAX_REQUEST_BYTES 64 KiB → 1 MiB (100 sealed variables of a few KiB fit).
- By design (plan): any socket client (web, CLI user) can read Development secrets — that is
  `env pull`; Production/Preview secrets have no op that returns them.
- Merged #34 (28b6ca3). Full suite: 3 timeouts under load (security agent running), 80/80 alone.

## U3 · CLI env ls / set / rm (#35, `feat/cli-env`, 2026-11-17)

- `cli/env-commands.ts`, `cli/stdin.ts` (terminal: stty -echo, one line; pipe: whole), `lib/db/env-store.ts`
  (upsert + audit in one transaction; `xmax = 0` for created). Secret by default, `--plain`;
  NEXT_PUBLIC_* always plain. `ls` never sends a secret's blob to env.reveal.
- Verified: 25 tests with the real Agent behind the client; drizzleEnvStore on postgres:17 9/9;
  real pty in oven/bun:1.3 with `script`: value not echoed, read whole, echo restored.
- Slip: the first commit had a broken string in main.ts (a Python edit turned `\n` into a newline);
  fixed in c2e48a3. Lesson: run typecheck before committing, not only the related tests.
- Merged #35.

## U4 · variables into the container (#36, `feat/switch-env-vars`, 2026-11-17)

- Switch reads the env's rows at each start (`SwitchRepo.envVars`) → `container.run {vars}`; the agent
  opens all first, writes /run/kit-agent/env/<container>.env (dir 0700, file 0600, not under the web's
  /run/kit-deploy mount), `docker run --env-file` before the platform's --env, removes it in finally.
- security-review HIGH: a compromised web could run its own ghcr.io image with another project's
  rows and get the plaintext. César chose (2026-11-17) the root-pinned repo:
  /etc/kit-deploy/images/<project> = `ghcr.io/<owner>/<repo>`, written only as root by `project add`
  or `project pin <p> <owner/repo>` (typed repo, must match the DB). The agent refuses vars for any
  other image (`forbidden`). Containers without vars need no pin.
- Verified: real docker --env-file keeps `=`, spaces, quotes, `#`, `$`, ñ; Linux modes 0700/0600 and
  pins 0755/0644 under umask 077; suite 550/0.
- VPS action with the phase release: `ssh kit-vps kit-deploy project pin kd_hello Fockus26/kd-hello`.
- Tooling lesson (twice today): in this Git Bash, `\n` inside a Python heredoc string ends up as a
  real newline in the file. Edit tool for anything with `\n`.
- Merged #36, #37 (+ `_preview` name guard from its review; kit-db role-reuse note → KIT_FEEDBACK #8).

## U6 · env pull (#38, merged)

- Development set → stdout, refused on a TTY; names only on stderr. `dotenvLine`: single quotes +
  `\$`, 17 awkward values round-trip through @next/env's real parser (test writes `.env`: under
  `bun test` NODE_ENV=test skips `.env.local`; `forceReload` or @next/env caches).

## U7 · build-env (#39, merged)

- POST /api/v1/build-env {environment}; web sends only plain NEXT_PUBLIC_* rows; agent `env.build`
  refuses anything else and adds the derived Server Actions key (HKDF per project + env; Next 16
  embeds it at `next build`, self-hosting guide).
- Template: response to $RUNNER_TEMP, key masked, BuildKit `secret-files` → Dockerfile
  `RUN --mount=type=secret,…,target=/app/.env.production.local`.
- Found with real Docker: BuildKit's cache ignores a secret's content → new values reused the old
  build. Fix: `ARG BUILD_ENV_HASH` (sha256 of the file) right before the build.
- Review notes (no finding): the key does end up in `.next` (Next needs it); a repo has one token,
  so a PR could ask for production's build env — same power it already has via /deploy.
- Shell lesson: Git Bash heredocs here also eat `\` in some commands; test data written with Write.

## U8a · redeploy (#40, merged) · U8b · rebuild (#41)

- `deployments.generation` (0007), in the open-commit unique index; container `…-g<n>`; agent regex
  accepts `-g2…-g9999` only. `queueRedeploy` copies the live row as the next generation.
- Rebuild: `kit-deploy rebuild <p>` (root, platform GitHub token) → workflow_dispatch
  `rebuild=true` → `{sha, rebuild: true}` → next generation of the live commit. Previews: push.
- Needs César: token Actions: Read and write; new deploy-vps.yml in kd-hello.

## Phase security-review (2026-11-17)

- Diff 92fbf71..feat/rebuild. One MEDIUM (conf 8), F1: a compromised web could set runtime names
  (HTTPS_PROXY, NODE_TLS_REJECT_UNAUTHORIZED=0, LD_PRELOAD, …) on a pinned container and read its
  secrets on the wire. Fixed in #42: RUNTIME_NAME_RE refused at seal, DB CHECK (0008), agent at start.
- Below threshold, fixed: sweep ignored `-g<n>` preview containers (#43).
- Caveats kept (not fixable by name rules): a compromised web can still change app variables
  (API_BASE_URL, swap AUTH_SECRET) or see the Server Actions key; containers kept for rollback keep
  removed/rotated secrets; one token per repo, so PR code can ask for production's build env.
- Guarantees: secrets never read back (holds, with the caveats above); DB backup can't decrypt
  (holds); build-env only public + key (holds); DATABASE_URL only to pinned containers (holds);
  no cross-project path (holds).
