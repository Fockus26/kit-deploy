# Phase 03 — Previews · log

Plan: `context/plans/03-previews.md` (agreed 2026-11-13).

## Before the code (2026-11-13)

- VPS, read-only: Caddy v2.10.2 already has `dns.providers.cloudflare`; its unit already loads
  `EnvironmentFile=-/etc/caddy/cloudflare.env` (`CLOUDFLARE_API_TOKEN`).
- César created the Cloudflare token (DNS Write + Zone Read on fockus.dev, IP filter 178.238.238.7,
  no expiry), wrote `/etc/caddy/cloudflare.env` (root 0600, one line), added the DNS-only
  `*.preview.fockus.dev` record, and gave the GitHub status token "Pull requests: read and write".
- `x.preview.fockus.dev` already resolved through `*.fockus.dev` (RFC 4592: no `preview` node);
  the explicit record keeps it working if `preview.fockus.dev` is ever created.

## U1 — feat/preview-wildcard

- The wildcard site ships in the release (`infra/caddy/kit-previews.caddy` + `pages/`) and
  update.sh installs it into `/etc/caddy/sites/kit-previews.caddy`, like the dashboard's site — no
  re-run of server-ready.sh (it touches certbot and resets /etc/kit-deploy to 0700).
- Found with the real Caddy: `caddy validate` provisions the Cloudflare module and refuses an
  empty/invalid token → update.sh reads the token (not sourcing the file) and passes it only in
  validate's env. A failed validate restores the previous file and exits 1.
- `header >X-Robots-Tag` (deferred) wins over an app's own header: checked with an upstream that
  sends `X-Robots-Tag: all` → one header, `noindex, nofollow`.
- `*.preview.fockus.dev` matches one label: `a.b.preview…` gets no site (TLS fails).
- Tests: `bun run test:infra:previews` (real Caddy, tls internal) ALL PASS; install --test in Docker:
  see the PR.
