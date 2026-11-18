# D028 · Infra · A domain enters its Caddy site only once its DNS points to the VPS; www ↔ apex as a 308 block in the same file · Implemented (2026-11-17)

**Decision:** `domains.dns_ok_at` is set the first time `kit-deploy domain check` (root timer, every
minute) sees every A record equal `VPS_IPV4` and no AAAA (the VPS has no IPv6); from then the host is in
the project's site file and a check never takes it out (`domain rm` does). The default
`<project>.fockus.dev` is always served. A redirect is a column on the host that redirects (`to_apex` on
`www.<apex>`, `to_www` on the apex); `site.write` grows `redirects: [{from, to}]` (≤ 50, `from` not one of
`hosts`, `to` one of them, both through the host schema) and `renderSite` adds `from { redir
https://<to>{uri} 308 }` in the same file. A redirect whose target is not served yet serves the site
itself. DNS lookups run in the CLI (`node:dns`, 5 s each), so there is no `dns.resolve` agent op. Rows
that existed before migration 0010 keep being served (`dns_ok_at = now()`, status `issuing`).
**Why:** Caddy asking Let's Encrypt for a host that does not resolve here fails HTTP-01 and counts
against the failed-validation limit (5/hour/host); an AAAA elsewhere makes LE validate over IPv6 at the
wrong machine. One file per site keeps `site.write`/`site.remove` as they are. Not removing on DNS flaps
keeps production answering.
**Discarded alternative:** a separate redirects file (a second path to validate and remove in step);
the agent resolving DNS (root process doing network lookups it does not need); removing hosts whose DNS
moved away (an outage on a transient resolver error).
