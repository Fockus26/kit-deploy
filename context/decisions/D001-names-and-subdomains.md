# D001 · Infra · kit-deploy at deploy.fockus.dev, previews <p>-pr-<n>.preview.fockus.dev, DNS-only · Pending

**Decision:** name kit-deploy; dashboard `deploy.fockus.dev`; previews `<project>-pr-<n>.preview.fockus.dev`
with one wildcard certificate (DNS-01, Caddy built with `caddy-dns/cloudflare`). Every kit-deploy record is
DNS-only (grey cloud) → 178.238.238.7; `db.fockus.dev` stays DNS-only.
**Why:** César, kickoff 2026-11-10. A second-level wildcard is not covered by Cloudflare's Universal SSL when
proxied, and per-preview certificates would hit Let's Encrypt's weekly limit.
**Discarded alternative:** previews on a separate domain (cookie isolation) — D013 isolates the cookie instead.
