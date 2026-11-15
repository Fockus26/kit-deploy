# Plan — phase 03 (Previews) · agreed with César 2026-11-13

One unit = one branch = one PR. Order: the login exists before any preview goes live (brief: noindex
and login from day one); no preview is served without `forward_auth`.

| # | Unit | What | VPS |
|---|---|---|---|
| U1 | infra: wildcard site | `infra/caddy/kit-previews.caddy` installed by update.sh into sites/ once the Cloudflare token + `*.preview` DNS exist; DNS-01, deferred `X-Robots-Tag`, 404 "preview no existe", `import /etc/caddy/previews/*.caddy` | yes, César's OK |
| U2 | auth backend | Better Auth (passkey + TOTP + recovery codes), schema + migration, no sign-up, rate limit, host-only cookie, `kit-deploy user create` → one-time enrolment link | release |
| U3 | `/login` bare page | passkey/TOTP in Spanish, a11y | — |
| U4 | preview access (D013) | `/preview-access?to=` one-time token → exchange on the preview host → `kd_preview` (`.preview.fockus.dev`, 12 h); `/api/v1/preview-auth` for forward_auth | — |
| U5 | core + agent: preview site file | `renderPreviewSite` (`@<site> host …` + `handle` with forward_auth + reverse_proxy, or "dormido"); validated agent ops into `/etc/caddy/previews/` | — |
| U6 | API + preview switch | `POST /api/v1/deploy {sha, pr}` → `pr-<n>` 384 MB; `DELETE /api/v1/preview`; a push replaces the PR's container | — |
| U7 | GitHub comment + status | PR comment created/updated in place, `kit-deploy/preview` status (token has Pull requests RW since 2026-11-13) | — |
| U8 | template `deploy-vps.yml` | `pull_request` events; Preview's public variables arrive in phase 04 | — |
| U9 | limit 4 + dormido (D017) | 5th preview sleeps the least recently pushed; wakes on its next push | — |
| U10 | nightly sweep | `kit-deploy preview sweep` + systemd timer | yes, César's OK |

Close: security-review (auth, forward_auth), a test PR on kd-hello (URL < 5 min, behind login, gone
on close), host-only cookie checked in the browser, context/ + `context:backup`.

U1 security review (2026-11-13): no findings. For U5: the agent validates host and port strictly
before writing a preview file, and `forward_auth` sits inside each preview's `handle`, before
`reverse_proxy` (no preview handle without it).

Shape of a preview file (U5 writes it; the real-Caddy test uses it). Since U4b the handle is only
`import kit_preview <addr>`: the snippet in kit-previews.caddy puts the exchange, forward_auth and
the app in a fixed order (security review U4a):

```
@kd_hello-pr-7 host kd-hello-pr-7.preview.fockus.dev
handle @kd_hello-pr-7 {
	import kit_preview 127.0.0.1:29007
}
```
