# Moving a project from Vercel to kit-deploy

The steps phase 07 followed with maranatha (D004), written for the next project. Phase 08 moves this
into the kit (`tech/vps-hosting.md`). Two kinds of step: **repo** (an agent, in the project's own PR) and
**César** (over `ssh kit-vps`, with his secrets; never through the chat).

## 1. Repo: one PR, safe to merge before anything else exists

1. Copy the templates (`README.md` here): `Dockerfile`, `dockerignore` → `.dockerignore`,
   `deploy-vps.yml` → `.github/workflows/`, `api-health-route.ts` → `app/api/health/route.ts`.
   Keep the project's own `.dockerignore` lines on top of the template's (never drop `.env*`).
2. **`output: "standalone"`.** If the project wants Vercel's build untouched while Vercel is still live,
   gate it in `next.config.ts` (`process.env.NEXT_OUTPUT === "standalone"`) and add
   `NEXT_OUTPUT=standalone` to the Dockerfile's build `ENV` — the only change to the template.
   `deploymentId` needs nothing: the Dockerfile sets `NEXT_DEPLOYMENT_ID` from the commit, and Vercel
   sets its own.
3. **Production branch.** The template deploys `main`. A project with deploy branches (`vercel`/`vps`)
   settles on one first; maranatha already had (its D091).
4. **Auth with an origin check** (Better Auth `trustedOrigins`, NextAuth `NEXTAUTH_URL`, CSRF lists):
   add `KIT_DEPLOY_PREVIEW_URL`, which kit-agent sets on every preview container to
   `https://<project>-pr-<n>.preview.fockus.dev` — the equivalent of `VERCEL_BRANCH_URL`. Production's
   origin is its own variable (`BETTER_AUTH_URL`, `NEXT_PUBLIC_SITE_URL`) as on Vercel.
5. **Vercel-only code** stays while Vercel is the fallback, if it is already gated on `VERCEL=1`
   (maranatha's `@vercel/analytics`); it goes with `vercel.json` when Vercel is switched off.
6. **Old deploy files** (an SSH + compose workflow, a Caddyfile) go in the same PR: kit-deploy replaces
   them. Their GitHub secrets are left for César to delete.
7. The workflow's switch stays **off**: with `KIT_DEPLOY_ENABLED` unset, every run only prints a
   notice, so merging this PR changes nothing in production.
8. Check: `docker build --build-arg GIT_SHA=$(git rev-parse HEAD) .`, then `docker run` with the
   project's development variables and `curl /api/health` and one page with `next/image`.

## 2. César: the platform side

```bash
ssh kit-vps kit-deploy project add <project> <owner/repo> [--memory 512]   # as root: pins the repo too
ssh kit-vps kit-deploy db adopt <project>            # a database that existed before (e.g. moved off Supabase)
ssh kit-vps kit-deploy db adopt <project> --yes      #   after checking the list is the project's
ssh kit-vps kit-deploy db create <project>           # or: a new one (production + previews)
ssh kit-vps kit-deploy token create <project> | gh secret set KIT_DEPLOY_TOKEN -R <owner/repo>
ssh -t kit-vps kit-deploy env set <project> production <NAME>          # secret; --plain for public
ssh kit-vps kit-deploy env ls <project> production                     # and preview: compare with Vercel
gh variable set KIT_DEPLOY_ENABLED --body true -R <owner/repo>
gh workflow run deploy-vps.yml -R <owner/repo> --ref main
```

- The repo also goes into the GitHub status token's Repository access (commit statuses, PR comment).
- **Variables:** copied from Vercel environment by environment. Never `DATABASE_URL` (kit-deploy sets it
  once the database is created or adopted) nor `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`. A new auth secret per
  environment rather than Vercel's. A subdomain-only variable (`ADMIN_HOST`) stays unset on
  `<project>.fockus.dev`.
- **Preview set:** payment providers in sandbox; no fixed site/auth URL (step 1.4 covers the origin).

## 3. Checks, then the week

1. `https://<project>.fockus.dev/api/health` → `{"ok":true,"sha":"<commit>"}`; a page with images; the
   dashboard login; a form that uploads (Caddy has no body limit of its own).
2. A PR: its preview comes up behind César's login; sign into the app there; close the PR, the preview goes.
3. Payment webhooks (PayPal, Binance…) pointed at the new production URL.
4. **Vercel stays one week** publishing `main` as the way back; switching off = `KIT_DEPLOY_ENABLED=false`.
   Then César decides: Vercel's project, `vercel.json` and its code go.
5. **Own domain** later, only when its DNS is César's: TTL to 300 s the day before, `kit-deploy domain
   add`, the `A` record, the checks again on the real domain.
