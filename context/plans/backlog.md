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

## Panel: heading levels and small polish (phase 05 wave 3, seen in passing) → W12
- **What:** (1) one rule for headings: project name = h1 in `p/[project]/layout.tsx`, page titles under it = h2 (W9 used h1 → two h1 per page; W10 used h2); `EmptyState` takes a heading level (it always renders h2, h3 → h2 in Ajustes). (2) LogViewer shows "En pausa/Reanudar" on a static search. (3) `addDomain` rejects `www.<host>` + to_apex without the apex with the generic "Ese dominio no es válido." (4) `stop/restart` of an unknown project → 409 instead of 404. (5) audit of `project.add` / `token.*` actions not verified. (6) changing an existing domain's redirect has no UI (CLI only).
- **Why:** a11y consistency and clearer errors.
- **Version:** v1 (phase 05 W12)

## Panel v1.x: passkeys and recovery codes from Ajustes (phase 05 W11)
- **What:** "Añadir passkey" and regenerating recovery codes from the panel; today only by SSH (`kit-deploy user enrol`), the handler allows new factors only to an enrolment session (ENROL_ONLY).
- **Why:** César's passkeys are not in his password manager yet.
- **Version:** v1.x — needs a security decision (step-up auth)

## Audit rows from the CLI too (phase 05 W13 follow-up)
- **What:** pass `sshActor()` from the CLI commands into the ops that now accept an `actor` (project add, token create/revoke, domain add/rm, redeploy, rollback, stop, restart); add domain.redirect, rebuild, db.create to the audited actions.
- **Why:** Ajustes › Auditoría today shows panel actions and env changes only; SSH actions by agents are missing.
- **Version:** v1 — small unit, before phase 07

## Agent: metrics.sample only from root; production log cap apart (phase 05 security review L2, L4)
- **What:** L2 — `metrics.sample` is callable by any member of the kit-deploy group (the web user too) and "consumes" closed minutes; check SO_PEERCRED uid 0 for that op or move it to a root-only socket. L4 — the 50 MiB/day log cap (D025) is shared with previews: a PR can blind production's logs; give production its own quota.
- **Why:** integrity of metrics and of incident logs.
- **Version:** v1.x

## Agent: root-only status ops, marker cleanup (phase 05 W14, seen in passing)
- **What:** `backups.status` (phase 06) gives the whole Postgres backup state to any member of the socket group — same class as L2, fix together (SO_PEERCRED). DB ownership markers (`/etc/kit-deploy/dbs/<db>`) are never removed when a project or its database goes away.
- **Why:** least privilege; stale markers would let a re-created project with the same name inherit "owned".
- **Version:** v1.x (with L2)

## Tailwind v4: `source(none)` in the global stylesheet (kit 3.25.0, step 4)
- **What:** `app/globals.css` imports Tailwind without `source(none)`, so it scans `context/`, `.claude/` and other folders for classes. Change it to `@import "tailwindcss" source(none);` plus explicit `@source` for `app/`, `components/`, `lib/` (kit `STACK-NEXTJS.md`). Compare the built CSS before and after: only classes that came from `context/` or `.claude/` may disappear.
- **Why:** smaller CSS and builds that do not depend on docs or the kit copy.
- **Version:** v1.x — small unit

- W1 #67: before hydration the Radix hidden select has no options, so a submit in that instant falls back to defaults (logs GET form, new project memory). Medium, check in QA.

## From the batch 2026-11-18 design QA (Medio/Bajo; report `qa-batch-2026-11-18-design.md`)

- Medio: ~75 controls under `size.control` (44 px) at ≤768 (theme button 32, Reintentar/Copiar 32, tabs 40, SHA links 37).
- Medio: "No se pudo hablar con kit-agent" repeated in header and body of project tabs; content starts at y≈400 at 1280–1536.
- Medio: forced-colors — primary button loses its border (`border border-transparent` on filled variants).
- Medio: lines of ~99–101 chars in Ajustes and ~82 in Dominios from 1536 px.
- Medio (design decision for César): at 1280–1536 `/new` and "Nuevo token" stay a 560 px column with 450–700 px empty (HANDOFF form width; W7 left it).
- Bajo: 2560/3840 content capped at 1440 and left-aligned, not centred.
- Bajo: project tabs cut at 360 with no scroll hint.
- Bajo: magic values `size-[18px]`, `min-[360px]:`, `tracking-[0.08em]` (26 matches).
- Bajo: QA seed has too few audit rows to exercise paging (W7 seeded 45 by hand).

## From the batch 2026-11-18 functional QA (Medio/Bajo; report `qa-batch-2026-11-18-functional.md`, repros in `qa-batch-2026-11-18-functional/`)

- Medio: after removing a passkey no "eliminada" notice and focus lands on `<body>` (row unmounts before `onCloseAutoFocus`). Repro `repro/1-aviso-passkey-eliminada.mjs`.
- Medio: names `www`, `deploy`, `db`, `preview` or ending in `_` rejected as «Revisa los datos del formulario.» with no field marked (schema lets them through; `addProject` rejects).
- Medio: network failure / 500 on Nuevo proyecto submit loses what was typed (`useActionState` without try/catch → error boundary).
- Medio: same repo with other case (`QA/Mem-x` vs `qa/mem-x`) creates a second project (unique is case-sensitive).
- Bajo: accepted values that later fail: repo `owner/repo.git`, branches git refuses (`refs/heads/main`, `feature/`, `main.lock`, `-rf`).
- Bajo: duplicate repo marks «Ya existe.» on Nombre.
- Bajo: passkey removal copy — expired session lacks «Entrar» link; phone-time hint never shown; account without TOTP promised «con tu app de autenticación».
- Bajo: Auditoría `?pagina=9999999999` → page 1 while `?pagina=999` → last.
- Suspected (not measured): combobox — pick a listed repo, then «Usar «…»» keeps the previous repo's branch.
- Decision for César: a QA-only `GITHUB_API_BASE` so `qa:local` can point the repo list at a local fake (combobox path otherwise untestable locally).
