# D024 · Infra · kit-agent follows containers through the Docker Engine API, not a `docker logs -f` per container · Confirmed (2026-11-17)

**Decision:** the log follower (D014) reads `GET /containers/<name>/logs?follow=1&timestamps=1&since=…` over
`/var/run/docker.sock` with Bun's `fetch({ unix })`, one stream per running managed container inside kit-agent's
own process, and decodes Docker's multiplexed frames itself (`agent/logs-system.ts`). Every 10 s it reconciles the
set with `container.list`; a stream that ends (container stopped or restarted) is opened again from the last
timestamp written, and a restart of the agent resumes from today's (or yesterday's) file.
**Why:** each `docker logs -f` is a Go CLI of tens of MB living in kit-agent's cgroup (`MemoryMax=256M`): with a
dozen previews running it would take the root daemon past its limit. The API needs no child processes.
**Discarded alternative:** one `docker logs -f` child per container (what the phase plan proposed); a Docker
logging driver (journald/syslog) — changes how every project's container is run and Docker's own `docker logs`.
