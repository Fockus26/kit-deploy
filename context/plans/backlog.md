# Backlog — kit-deploy

One block per item: what, why, version.

## F15 · Static and Astro sites
- **What:** static export served by Caddy itself; Astro with the Node adapter as one more container.
- **Why:** world-flags and future content sites. Brief: v2.
- **Version:** v2

## Collaborators and read-only client view (F13 v2)
- **What:** more than one user, roles, a read-only page per client.
- **Why:** client projects. Brief: v2.
- **Version:** v2

## MCP server for the agents (F14 v2)
- **What:** the CLI's operations as MCP tools.
- **Why:** agents without SSH.
- **Version:** v2

## GitHub App instead of per-repo tokens
- **What:** one App for deploy webhooks and PR comments.
- **Why:** fewer secrets once there are many repos. Brief: v2.
- **Version:** v2

## Subdomains on fockus.dev created by kit-deploy
- **What:** with the Cloudflare token (already needed for DNS-01, but scoped to DNS edit), create
  `<project>.fockus.dev` records automatically from the "Domains" page.
- **Why:** removes César's only manual step for projects without their own domain.
- **Version:** v1.x, after phase 07 — needs a decision on token scope.

## Shared Next.js cache handler
- **What:** cache shared across instances.
- **Why:** only if a site ever runs more than one instance. Brief: v2.
- **Version:** v2

## Panel: `Date.now()` during prerender (phase 05 W5, seen in passing)
- **What:** every panel route logs "unstable value `Date.now()` while prerendering" from `dashboardUser` (`lib/auth/session.ts:36`, default param `now = Date.now()`) called by `app/(panel)/layout.tsx`. Compute `now` inside the function after `await connection()`.
- **Why:** noise in dev, risk of a cached wrong session check. Goes into W12 (states/polish).
- **Version:** v1 (phase 05 W12)
