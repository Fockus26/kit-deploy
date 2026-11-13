# D020 · Infra · A project without its own domain answers on `<project>.fockus.dev`; one `*.fockus.dev` record · Confirmed (2026-11-12)

**Decision:** `kit-deploy project add` gives each project `<project>.fockus.dev` (kit-db `_` → `-`), unless
`--no-default-domain`. DNS: one wildcard A record `*.fockus.dev` → 178.238.238.7, DNS-only; certificates per host
by HTTP-01. `db`, `deploy`, `preview` and `www` are never a project's subdomain. The phase-02 test app is
`kd-hello.fockus.dev` (not `hello.fockus.dev`).
**Why:** César, 2026-11-12 ("los proyectos que no tengan dominio propio tendrán el dominio nombreproyecto.fockus.dev").
A wildcard spares a DNS record per project; explicit records (`db`) still win over it.
**Discarded alternative:** a record per project; a wildcard certificate for `*.fockus.dev` (DNS-01, the Cloudflare
token is only needed for previews in phase 03).
