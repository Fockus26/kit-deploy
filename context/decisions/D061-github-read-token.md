# D061 · Security · The repo list uses a second, read-only GitHub token in its own github-read.env · Implemented

**Decision:** Nuevo proyecto lists César's repos with `GITHUB_READ_TOKEN`, a separate
fine-grained token (Repository access: All repositories; permissions: Metadata: read only),
written by `install.sh --github-read-token` (stdin, `github_pat_*|ghp_*`, `printf` builtin,
tmp + mv) to `/etc/kit-deploy/github-read.env` (0600 root). `update.sh` gives it to the web as a
third `--env-file` when it exists; the CLI never reads it. Only the server uses it
(`lib/github/repos.ts`: `GET /user/repos`, `affiliation=owner,collaborator,organization_member`,
`sort=pushed`, paged by `Link: rel="next"` up to 5 pages / 500 repos, only links on the same
`api.github.com`); the form only gets `fullName`, `private`, `pushedAt`, `defaultBranch`.
Cached in process memory 5 min per token; a failure is not cached and it never throws:
`no-token`, or `error` with the HTTP status (null when GitHub did not answer).
**Why:** the commit-status token (`GITHUB_STATUS_TOKEN`) only has "Commit statuses" on the
projects' repos; giving it "All repositories" would widen what it can write. A separate read-only
one limits a leak to seeing repo names. Its own file because `--github-token` rewrites
`github.env` whole and a new key there would be lost.
**Discarded alternative:** an API route the client calls (the token would stay on the server, but
it is one more surface to protect and a loading state inside the field); widening the status
token (one secret, but more permissions than needed).
