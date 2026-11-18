# D029 · Infra · cert.status reads the certificate Caddy stored, not a TLS handshake · Implemented (2026-11-17)

**Decision:** kit-agent's `cert.status { host }` reads
`/var/lib/caddy/.local/share/caddy/certificates/<issuer>/<host>/<host>.crt` for Let's Encrypt and
ZeroSSL, parses it with `node:crypto` `X509Certificate`, keeps the newest that covers the host and returns
`{ notAfter, issuer, source } | null`. The key next to it is never read. `domain check` marks a host
`ready`; `error` when there is no certificate 30 min after DNS pointed, it expires within 7 days (Caddy
renews at 30) or has expired. Ready hosts are re-checked hourly.
**Why:** no subprocess and no network from the root daemon, deterministic and testable with `Deps.readFile`
(no new `Deps` method); Caddy serves what it stores. The host passes the schema and `assertHost` before it
becomes a path.
**Discarded alternative:** `openssl s_client -servername <host> -connect 127.0.0.1:443` (proves what is
served on the wire, but a subprocess per host every minute, output parsing and a timeout to tune; the
storage path is Caddy's documented default for a `caddy` user without XDG overrides — if that changes, the
check reports "no certificate" and the host goes to `error`, nothing breaks).
