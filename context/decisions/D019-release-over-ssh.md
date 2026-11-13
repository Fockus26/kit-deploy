# D019 · Infra · kit-deploy ships as a release tarball over SSH; web and CLI on PgBouncer · Confirmed (2026-11-12)

**Decision:** `scripts/release.sh` builds, in Docker on César's PC, `kit-deploy-<sha12>.tgz` (agent, CLI and
migrate binaries, Next standalone web, `drizzle/`, `infra/`) from `git archive HEAD`; `scripts/ship.sh` copies it
to the VPS and runs that release's `install.sh`/`update.sh`. The web runs as container `kit-deploy-web` on the
bridge network, published on `127.0.0.1:3100`, never `--network host` (Caddy's admin API on the host's loopback).
Web and CLI use `kit-db url kit_deploy` (PgBouncer, verify-full); migrations use `--direct` (127.0.0.1:5432); the
switch's lock is `pg_advisory_xact_lock` inside a transaction, valid under transaction pooling.
**Why:** César, 2026-11-12: the VPS needs no GitHub access, no bun and no build RAM (8 GB shared). Security review
of the install unit found the host-network exposure.
**Discarded alternative:** image from CI on GHCR (a token for the private repo, more CI); clone and build on the VPS.
