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
