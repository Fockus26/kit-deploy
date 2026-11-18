# D032 · Data · Panel reads in lib/panel/data, Server Actions as thin wrappers over lib/panel/actions, shared ops in lib/ops · Implemented (2026-11-17)

**Decision:** the panel's pages read through `lib/panel/data` (`homeData`, `projectOverview`,
`deployments`, `deploymentDetail`, `previews`, `envList`, `domainsData`, `logFilters`, `logsTail`,
`logsSearch`, `databases`, `settingsData`): each one calls `panelUser()` first, is wrapped in React
`cache` and is pure underneath (`read*` over `PanelDeps`). kit-agent down or refusing is a typed
`{ unavailable: "agent", code? }` in the part it affects (a page's section, the plain values of
Variables, the container state of the header), never a throw; reads use a 10 s agent timeout. The
Server Actions are `app/(panel)/actions/<topic>.ts` (`"use server"`, `(prev, formData)` for
`useActionState`) and only wire `actionDeps()` into `lib/panel/actions/<topic>.ts`, where every action
runs `runAction`: session (`sessionUser()`, none → `{ ok: false, code: "unauthorized", status: 401 }`),
then the form's zod schema (`lib/panel/schemas.ts`, shared with the forms: trim + min + max per
column, Spanish messages), then the work. Results are `{ ok: true, … } | { ok: false, code, status,
message, fields? }`. What the CLI and the panel both do lives in `lib/ops/*` (env set/rm/reveal,
domain add/rm/redirect/check, redeploy queue, rebuild dispatch, Parar/Reiniciar, db create, project
add, deploy token); the CLI keeps its parsing and its English lines. `proxy.ts` no longer redirects a
POST without the cookie: a Server Action answers its own 401.
**Why:** the page units of wave 3 become presentation only, and the rules (names, hosts, last-host,
default-domain, `NEXT_PUBLIC_*` plain, idempotency) exist once for both front ends. Pure logic over
injected dependencies is testable with bun:test without Next (`next/headers`, `after`,
`revalidatePath`), so every action and reader has unit tests with the real kit-agent behind a fake
Docker.
**Discarded alternative:** route handlers under `/api/v1/panel/*` called with `fetch` from the client
(a second API surface with its own CSRF story, and Next's Server Actions already check Origin); or the
logic inside the `"use server"` files (untestable without mocking Next, and a `"use server"` file can
only export async functions).
