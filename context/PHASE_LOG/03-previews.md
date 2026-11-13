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
- PR #17 merged (f8632b5). Two bugs the Docker test caught before the merge: release.sh did not
  ship `infra/caddy/`; with no cloudflare.env, `sed | head` + pipefail ended update.sh in silence.

### U1 on the VPS (2026-11-13, César's OK)

- `ship.sh` f8632b5: release in `current`, agent + web restarted, `kit-previews.caddy` written,
  validate OK with the real token — but `systemctl reload caddy` failed: the running Caddy (started
  01:46) predates cloudflare.env (18:02); a reload does not re-read EnvironmentFile → "API token ''".
  Caddy kept the old config (sites up: kd-hello 200, deploy 200), but the reload job hung systemctl
  and ship.sh (>10 min).
- With César's OK: `systemctl cancel 36205`, `systemctl restart caddy` → token in its env, Let's
  Encrypt `*.preview.fockus.dev` (YE1, until 2027-02-11) by DNS-01 in seconds. From outside:
  `nope-pr-1.preview.fockus.dev` → 404 "Este preview no existe", `X-Robots-Tag: noindex, nofollow`,
  `no-store`; http → 308. kd-hello 200, deploy 200. `certbot renew --dry-run` db.fockus.dev: success.
- CT logs: scanners hit bare `preview.fockus.dev` within a minute of issuance (not a preview host).
- Left on the VPS: `/tmp/kit-deploy-ship.QRv4fu` and `.za4T51` (~160 MB each; ship.sh's rm skipped
  after the failure) — César decides.
- Fix PR #18 (fix/caddy-restart-token): restart when Caddy lacks the token, bounded reload + cancel,
  every validate with the token (else the dashboard's validate would fail once the previews site
  exists). Install --test 70/70. Ships with the next release.
- 2026-11-13, César's OK: removed both leftover `/tmp/kit-deploy-ship.*` dirs (161 + 143 MB, only
  release tarballs already unpacked). Disk / 15 % of 96 G.
- U2 (auth backend) handed to its own session.
