# D008 · Infra · Versioned with Changesets; `kit-deploy version` prints package version + SHA · Implemented

**Decision:** Changesets as set up by `new-project.ps1`; the CLI's `version` returns `package.json`'s version
and the commit SHA. That command is what the kit checks to know the platform exists.
**Why:** César, kickoff: a CHANGELOG says what changed in each server update.
