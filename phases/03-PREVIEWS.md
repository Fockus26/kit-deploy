# Phase 03 — Previews

## Goal

Each PR gets `<project>-pr-<n>.preview.fockus.dev`, behind César's login, in under 5 minutes.

## Scope

- Wildcard `*.preview.fockus.dev` by DNS-01 (Cloudflare token).
- Better Auth minimal (passkey + TOTP, no sign-up, first account seeded by CLI) on
  `deploy.fockus.dev` — a bare login page; its design arrives in phase 05.
- Preview protection by `forward_auth` + one-time token + `kd_preview` cookie (D013); `X-Robots-Tag:
  noindex` on every preview.
- The workflow's PR events: build with Preview's public variables → deploy `pr-<n>` → a PR comment
  created or updated in place + a commit status. `closed` → `DELETE /preview`; nightly sweep of
  previews whose PR is no longer open.
- At most 4 running, the oldest sleeps; "preview dormido" and "preview no existe" pages from Caddy (D017).

## Closes when

- [ ] A PR on `kd-hello` gets its URL in the PR in < 5 min, behind the login, and loses it on close.
- [ ] The dashboard session cookie is host-only (checked in the browser); a production site on
      `*.fockus.dev` never receives it.
- [ ] `security-review` of auth and forward_auth.
