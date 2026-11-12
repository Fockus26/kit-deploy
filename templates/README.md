# templates/

Files a Next.js project copies to deploy on kit-deploy (phase 08 moves this into the kit).

| Template | Goes to | What it does |
|---|---|---|
| `Dockerfile` | `Dockerfile` | bun install + build, Node runtime, non-root uid 1001, `NEXT_DEPLOYMENT_ID` = commit |
| `dockerignore` | `.dockerignore` | keeps `.env*`, `.git`, `node_modules` and `context/` out of the image |
| `api-health-route.ts` | `app/api/health/route.ts` | what the switch waits for before moving traffic |
| `deploy-vps.yml` | `.github/workflows/deploy-vps.yml` | build → GHCR → `POST /api/v1/deploy` |

The project also needs:

- `output: "standalone"` in `next.config.ts` (the build fails with a clear message without it).
- The `KIT_DEPLOY_TOKEN` repository secret: César pastes it in GitHub; it never goes through
  the chat or a file.
- If its production branch is not `main`, the `branches:` of `deploy-vps.yml` changed to match.

Runtime variables are not baked in: kit-agent passes them to the container (phase 04).
`NEXT_PUBLIC_*` need a build, so they arrive as build args in phase 04.
