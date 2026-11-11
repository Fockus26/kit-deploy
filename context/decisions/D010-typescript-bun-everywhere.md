# D010 · Infra · One language: TypeScript on bun; agent and CLI compiled with `bun build --compile` · Pending

**Decision:** kit-agent (root daemon) and the `kit-deploy` CLI are TypeScript, compiled to single binaries in
`/usr/local/bin`, with shared code in `lib/core/`. Tests with `bun test`.
**Why:** one stack for one person; no separate runtime to keep on the server; validation and types shared with
the web app.
**Discarded alternative:** Go for the agent (smaller, mature for daemons) — a second language to maintain.
