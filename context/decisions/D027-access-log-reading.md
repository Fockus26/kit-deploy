# D027 · Infra · kit-agent reads Caddy's access log from a saved offset and returns each closed minute once · Confirmed (2026-11-17)

**Decision:** `/var/lib/kit-deploy/metrics/access-log.json` (root 0600 in a 0700 dir) keeps the inode, the byte
offset, the minute up to which minutes were returned (`through`) and the counts of the minutes still open. Each
sample reads at most 8 MiB from the offset; a line cut at the end waits for the next read; another inode or a file
shorter than the offset (Caddy rolled it) is read from its start — the old file's last ≤ 30 s are lost. A minute
closes 5 s after it ends (mid-backlog: when a later line was read). Hosts are normalised (lowercase, no port, DNS
names only) and capped at 1000 open at once: the Host header is the client's. The file is opened O_NOFOLLOW |
O_NONBLOCK and refused unless regular (Caddy's user owns /var/log/caddy). Only the timer calls the op:
`kit-deploy metrics <project>` and the dashboard read the database.
**Why:** at-most-once minutes plus D026's write-once rule: no double counting without the agent having a database.
**Discarded alternative:** the collector keeping the offset in Postgres and passing it in (the agent stateless):
the open minutes' counts would cross the socket both ways and the CLI would decide which bytes the root process
reads; `tail -F` as a resident follower: one more long-lived process for a 30 s sample.
