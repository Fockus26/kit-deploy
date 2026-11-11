# D013 · Auth · Preview login through forward_auth and a one-time token; dashboard cookie never leaves deploy.fockus.dev · Pending

**Decision:** Caddy `forward_auth` on every preview. Without a valid `kd_preview` cookie it redirects to
`deploy.fockus.dev/preview-access?to=<url>`; with a dashboard session that issues a one-time, short-lived token,
which the preview host exchanges for `kd_preview` (Domain `.preview.fockus.dev`, HttpOnly, Secure, SameSite=Lax,
12 h). The dashboard session cookie is host-only on `deploy.fockus.dev`.
**Why:** a cookie on `.fockus.dev` would be sent to every production site on a fockus.dev subdomain
(maranatha.fockus.dev, …): any of them could read the dashboard session.
**Discarded alternative:** session cookie on `.fockus.dev` (simple, leaks); previews on another domain (cost, DNS).
