# D017 · Infra · Previews 384 MB each, at most 4 running; the oldest sleeps and wakes on its next push · Pending

**Decision:** a fifth preview stops the least recently pushed one; a stopped preview's host serves a
"preview dormido" page from Caddy (with its PR and how to wake it). Production sites 256–512 MB each.
**Why:** the brief's memory budget on 8 GB shared with Postgres and unrelated containers.
